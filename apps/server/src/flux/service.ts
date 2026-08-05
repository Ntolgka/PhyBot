import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import type {
  FluxConfig,
  FluxGenerationResult,
  FluxImage,
  FluxStatus,
  FluxStyle,
} from '@phybot/shared';
import { MAX_FLUX_BATCH, MIN_FLUX_BATCH } from '@phybot/shared';
import { bus } from '../core/bus.js';
import { AppError, ConflictError, ExternalServiceError, NotFoundError } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import { getFluxConfig } from './config.js';
import { fitToModel, prepareInputImage, REFINE_MAX_SIDE } from './imageInput.js';
import {
  ensureFluxDirectories,
  fluxDir,
  fluxImagesDir,
  fluxModelsDir,
  imagePath,
  isFluxInstalled,
  modelPath,
} from './paths.js';
import { fluxRepository } from './repository.js';
import { runEdit, runGeneration, runRefine, runUpscale } from './runner.js';
import { applyStyle } from './style.js';

const log = createLogger('flux');

/** ESRGAN models in this pipeline are all four times enlargements. */
const UPSCALE_FACTOR = 4;

/**
 * Size the refine pass runs at: the enlarged size, held to what the card can
 * sample. A four times upscale of a 1024 image is 4096, which fails, so those
 * come back at 2048 with real detail instead of 4096 of interpolation.
 */
function refineSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, REFINE_MAX_SIDE / Math.max(width, height));
  const round = (value: number): number => Math.round((value * scale) / 64) * 64;
  return { width: round(width), height: round(height) };
}

/** The generator uses the whole GPU, so only one job runs at a time. */
let running = false;
let queued = 0;
let lastError: string | null = null;

export interface GenerateParams {
  prompt: string;
  negativePrompt?: string;
  count?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  /** Appends wording that pins the look down; the seed decides otherwise. */
  style?: FluxStyle;
  requestedBy?: string;
}

function publishStatus(): void {
  bus.emit('flux:status', getFluxStatus());
}

/** Extensions ESRGAN weights ship in; the binary only understands that family. */
const UPSCALER_EXTENSIONS = new Set(['.pth', '.safetensors']);

/**
 * Lists the upscaler weights sitting in the models directory so the dashboard
 * can offer them instead of asking for a file name. Anything the generation
 * pipeline already uses is left out - a VAE is not an upscaler.
 */
function listUpscaleModels(config: FluxConfig): string[] {
  const inUse = new Set(
    [config.model, config.clipL, config.t5, config.llm, config.vae].filter(Boolean),
  );
  try {
    return readdirSync(fluxModelsDir)
      .filter((name) => UPSCALER_EXTENSIONS.has(extname(name).toLowerCase()) && !inUse.has(name))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    // The directory only exists after the setup script has run once.
    return [];
  }
}

export function getFluxStatus(): FluxStatus {
  const config = getFluxConfig();
  const missing: string[] = [];

  const installed = isFluxInstalled();
  if (!installed) missing.push('the stable-diffusion.cpp binary (Flux/bin)');

  // FLUX.2 reads the prompt with one language model; FLUX.1 needs CLIP and T5.
  const required: [string, string][] = config.llm
    ? [
        [config.model, 'diffusion model'],
        [config.llm, 'text encoder'],
        [config.vae, 'VAE'],
      ]
    : [
        [config.model, 'diffusion model'],
        [config.clipL, 'CLIP text encoder'],
        [config.t5, 'T5 text encoder'],
        [config.vae, 'VAE'],
      ];
  for (const [fileName, label] of required) {
    if (!existsSync(modelPath(fileName))) missing.push(`${label} (${fileName})`);
  }
  if (config.upscaleModel && !existsSync(modelPath(config.upscaleModel))) {
    missing.push(`upscale model (${config.upscaleModel})`);
  }

  return {
    installed,
    // The upscale model is optional, so it does not block generation.
    modelsReady: required.every(([fileName]) => existsSync(modelPath(fileName))),
    backend: config.backend,
    missing,
    upscaleModels: listUpscaleModels(config),
    busy: running,
    queued,
    lastError,
    directory: fluxDir,
  };
}

function assertReady(): void {
  const status = getFluxStatus();
  if (!status.installed || !status.modelsReady) {
    throw new AppError(
      'flux_not_ready',
      `The image generator is not set up yet. Missing: ${status.missing.join(', ')}. Run "npm run flux:setup" in the project folder.`,
      503,
    );
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_646) + 1;
}

/**
 * Collects the files the binary wrote for a batch. The output template uses a
 * %d placeholder whose starting index depends on the build, so the directory
 * is scanned for the prefix instead of assuming names.
 */
function collectBatchFiles(batchId: string): string[] {
  return readdirSync(fluxImagesDir)
    .filter((name) => name.startsWith(`${batchId}_`) && extname(name).toLowerCase() === '.png')
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

export async function generateImages(params: GenerateParams): Promise<FluxGenerationResult> {
  assertReady();
  if (running) {
    throw new ConflictError('An image is already being generated. Wait for it to finish.');
  }

  const config = getFluxConfig();
  const count = Math.min(Math.max(params.count ?? 1, MIN_FLUX_BATCH), MAX_FLUX_BATCH);
  const width = params.width ?? config.width;
  const height = params.height ?? config.height;
  const steps = params.steps ?? config.steps;
  const cfgScale = params.cfgScale ?? config.cfgScale;
  const baseSeed = params.seed !== undefined && params.seed >= 0 ? params.seed : randomSeed();
  const batchId = randomUUID().replace(/-/g, '').slice(0, 12);
  // Stored as one string so the gallery shows exactly what produced the image.
  const prompt = applyStyle(params.prompt, params.style);

  /**
   * A negative prompt only means something when classifier free guidance is
   * active. FLUX.1-schnell is guidance distilled and runs at a scale of 1,
   * where the unconditional branch is never computed, so the text would be
   * silently ignored. It is dropped here and reported instead of pretending.
   */
  const negativePrompt = cfgScale > 1 ? (params.negativePrompt ?? '') : '';
  if (params.negativePrompt && !negativePrompt) {
    log.info(
      { cfgScale },
      'Ignoring the negative prompt: it needs a guidance scale above 1, which this model is not trained for',
    );
  }

  ensureFluxDirectories();
  running = true;
  queued = 0;
  publishStatus();
  const startedAt = Date.now();

  try {
    await runGeneration(config, {
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      cfgScale,
      seed: baseSeed,
      batchCount: count,
      outputPath: resolve(fluxImagesDir, `${batchId}_%d.png`),
      onProgress: (progress) => {
        bus.emit('flux:progress', {
          batchId,
          // The binary renders a batch sequentially and reports one step
          // counter, so the image index is derived from how far it has come.
          index: Math.min(count, Math.floor(progress.step / Math.max(1, steps)) + 1),
          total: count,
          step: progress.step,
          totalSteps: progress.totalSteps,
          message: progress.message,
          at: Date.now(),
        });
      },
    });

    const files = collectBatchFiles(batchId);
    if (files.length === 0) {
      throw new ExternalServiceError('flux', 'The generator finished without writing an image');
    }

    const durationMs = Date.now() - startedAt;
    const images = files.map((fileName, index) =>
      fluxRepository.create({
        batchId,
        indexInBatch: index,
        prompt,
        negativePrompt,
        // A batch increments the seed per image, matching the binary.
        seed: baseSeed + index,
        width,
        height,
        steps,
        cfgScale,
        fileName,
        durationMs: Math.round(durationMs / files.length),
        requestedBy: params.requestedBy ?? 'dashboard',
      }),
    );

    lastError = null;
    log.info(
      { batchId, count: images.length, seconds: Math.round(durationMs / 1000) },
      'Generated images',
    );
    return { batchId, images };
  } catch (error) {
    lastError = (error as Error).message;
    throw error;
  } finally {
    running = false;
    publishStatus();
  }
}

export function listImages(options: { limit?: number; savedOnly?: boolean } = {}): FluxImage[] {
  return fluxRepository.list(options);
}

export function getImage(id: number): FluxImage {
  const image = fluxRepository.getById(id);
  if (!image) throw new NotFoundError('That image does not exist');
  return image;
}

/** Absolute path of an image file, always inside the images directory. */
export function imageFilePath(
  image: FluxImage,
  variant: 'original' | 'upscaled' = 'original',
): string {
  const fileName =
    variant === 'upscaled' && image.upscaledFileName ? image.upscaledFileName : image.fileName;
  return imagePath(fileName);
}

export interface UpscaleOptions {
  /** Upscaler to use for this image; defaults to the configured one. */
  model?: string;
  /** Follows the upscale with a diffusion pass that draws real detail in. */
  refine?: boolean;
}

export async function upscaleImage(id: number, options: UpscaleOptions = {}): Promise<FluxImage> {
  const image = getImage(id);
  const config = getFluxConfig();
  const model = options.model || config.upscaleModel;
  const refine = options.refine ?? false;

  // Re-running with the same recipe would burn a minute to rewrite the same
  // file, but asking for a different upscaler is a real request.
  if (
    image.upscaledFileName &&
    image.upscaledModel === model &&
    image.upscaleRefined === refine &&
    existsSync(imageFilePath(image, 'upscaled'))
  ) {
    return image;
  }
  assertReady();

  if (!model || !existsSync(modelPath(model))) {
    throw new AppError(
      'flux_no_upscaler',
      `The upscale model (${model || 'not configured'}) is missing from Flux/models. Run "npm run flux:setup".`,
      503,
    );
  }
  if (running) {
    throw new ConflictError('The generator is busy. Try again when the current job finishes.');
  }

  const source = imageFilePath(image);
  if (!existsSync(source)) throw new NotFoundError('The image file is gone');

  const stem = basename(image.fileName, extname(image.fileName));
  const outputName = `${stem}_upscaled.png`;
  const outputPath = imagePath(outputName);
  running = true;
  publishStatus();

  const emit = (message: string, step: number, totalSteps: number): void => {
    bus.emit('flux:progress', {
      batchId: image.batchId,
      index: 1,
      total: 1,
      step,
      totalSteps,
      message,
      at: Date.now(),
    });
  };

  try {
    await runUpscale(config, {
      inputPath: source,
      outputPath,
      model,
      onProgress: (progress) => emit('upscaling', progress.step, progress.totalSteps),
    });

    if (!existsSync(outputPath)) {
      throw new ExternalServiceError('flux', 'The upscaler finished without writing an image');
    }

    if (refine && config.refineStrength > 0) {
      // The enlarged file is both the input and the destination, so the pass
      // writes to a temporary name first rather than reading a file it is
      // replacing.
      const refinedName = `${stem}_refined.png`;
      const refinedPath = imagePath(refinedName);
      const size = refineSize(image.width * UPSCALE_FACTOR, image.height * UPSCALE_FACTOR);
      await runRefine(config, {
        inputPath: outputPath,
        outputPath: refinedPath,
        prompt: image.prompt,
        width: size.width,
        height: size.height,
        strength: config.refineStrength,
        steps: config.refineSteps,
        seed: image.seed,
        onProgress: (progress) => emit('refining', progress.step, progress.totalSteps),
      });
      if (!existsSync(refinedPath)) {
        throw new ExternalServiceError('flux', 'The refine pass finished without writing an image');
      }
      rmSync(outputPath, { force: true });
      renameSync(refinedPath, outputPath);
    }

    fluxRepository.setUpscaled(id, outputName, model, refine);
    lastError = null;
    return getImage(id);
  } catch (error) {
    lastError = (error as Error).message;
    throw error;
  } finally {
    running = false;
    publishStatus();
  }
}

export interface EditParams {
  /** What to change, written as an instruction: "make the armor golden". */
  prompt: string;
  /** Gallery image to edit; alternatively pass the bytes in `imageData`. */
  imageId?: number;
  /** An upload or a Discord attachment, in any format ffmpeg reads. */
  imageData?: Buffer;
  count?: number;
  steps?: number;
  seed?: number;
  requestedBy?: string;
}

/**
 * Rewrites an existing picture from a written instruction.
 *
 * The source is passed as a reference image rather than as a noised starting
 * point, which is what keeps the parts of the picture the instruction says
 * nothing about: the same face, the same tree, different armour.
 */
export async function editImage(params: EditParams): Promise<FluxGenerationResult> {
  assertReady();
  if (running) {
    throw new ConflictError('An image is already being generated. Wait for it to finish.');
  }
  if (!params.imageId && !params.imageData) {
    throw new AppError('flux_no_source', 'Provide an image to edit', 400);
  }

  const config = getFluxConfig();
  const count = Math.min(Math.max(params.count ?? 1, MIN_FLUX_BATCH), MAX_FLUX_BATCH);
  const steps = params.steps ?? config.steps;
  const baseSeed = params.seed !== undefined && params.seed >= 0 ? params.seed : randomSeed();
  const batchId = randomUUID().replace(/-/g, '').slice(0, 12);
  const requestedBy = params.requestedBy ?? 'dashboard';

  ensureFluxDirectories();

  // An upload becomes a gallery entry of its own, so a chain of edits can keep
  // referring back to it and the retention job cleans it up like anything else.
  let source: FluxImage;
  if (params.imageData) {
    const prepared = await prepareInputImage(params.imageData);
    const fileName = `${batchId}_source.png`;
    writeFileSync(imagePath(fileName), prepared.png);
    source = fluxRepository.create({
      batchId,
      indexInBatch: 0,
      prompt: 'Uploaded for editing',
      negativePrompt: '',
      seed: 0,
      width: prepared.width,
      height: prepared.height,
      steps: 0,
      cfgScale: 0,
      fileName,
      durationMs: 0,
      requestedBy,
    });
  } else {
    source = getImage(params.imageId as number);
  }

  const sourcePath = imageFilePath(source);
  if (!existsSync(sourcePath)) throw new NotFoundError('The image file is gone');
  const { width, height } = fitToModel(source.width, source.height);

  running = true;
  queued = 0;
  publishStatus();
  const startedAt = Date.now();

  try {
    await runEdit(config, {
      referencePaths: [sourcePath],
      prompt: params.prompt,
      width,
      height,
      steps,
      seed: baseSeed,
      batchCount: count,
      outputPath: resolve(fluxImagesDir, `${batchId}_%d.png`),
      onProgress: (progress) => {
        bus.emit('flux:progress', {
          batchId,
          index: Math.min(count, Math.floor(progress.step / Math.max(1, steps)) + 1),
          total: count,
          step: progress.step,
          totalSteps: progress.totalSteps,
          message: progress.message,
          at: Date.now(),
        });
      },
    });

    // The uploaded source shares the batch prefix, so it has to be excluded or
    // it would be recorded a second time as a result.
    const files = collectBatchFiles(batchId).filter((name) => name !== source.fileName);
    if (files.length === 0) {
      throw new ExternalServiceError('flux', 'The editor finished without writing an image');
    }

    const durationMs = Date.now() - startedAt;
    const images = files.map((fileName, index) =>
      fluxRepository.create({
        batchId,
        indexInBatch: index,
        prompt: params.prompt,
        negativePrompt: '',
        seed: baseSeed + index,
        width,
        height,
        steps,
        cfgScale: config.cfgScale,
        fileName,
        durationMs,
        requestedBy,
        sourceImageId: source.id,
      }),
    );

    lastError = null;
    log.info(
      { batchId, count: images.length, seconds: Math.round(durationMs / 1000) },
      'Edited an image',
    );
    return { batchId, images };
  } catch (error) {
    lastError = (error as Error).message;
    throw error;
  } finally {
    running = false;
    publishStatus();
  }
}

/** Marks an image as kept so the cleanup job leaves it alone. */
export function saveImage(id: number): FluxImage {
  const image = getImage(id);
  if (!image.saved) fluxRepository.setSaved(id, true);
  return getImage(id);
}

export function deleteImage(id: number): void {
  const image = getImage(id);
  for (const variant of ['original', 'upscaled'] as const) {
    const file = imageFilePath(image, variant);
    if (variant === 'upscaled' && !image.upscaledFileName) continue;
    try {
      rmSync(file, { force: true });
    } catch (error) {
      log.debug({ file }, `Could not remove the file: ${(error as Error).message}`);
    }
  }
  fluxRepository.delete(id);
}

/** Removes unsaved images older than the configured age. */
export function cleanupOldImages(): number {
  const days = getFluxConfig().keepUnsavedDays;
  if (days <= 0) return 0;

  const stale = fluxRepository.staleUnsaved(Date.now() - days * 24 * 60 * 60 * 1000);
  for (const image of stale) {
    try {
      deleteImage(image.id);
    } catch (error) {
      log.debug({ id: image.id }, `Cleanup skipped an image: ${(error as Error).message}`);
    }
  }
  if (stale.length > 0) log.info(`Removed ${stale.length} unsaved images older than ${days} days`);
  return stale.length;
}

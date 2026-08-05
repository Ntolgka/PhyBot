import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import type { FluxGenerationResult, FluxImage, FluxStatus } from '@phybot/shared';
import { MAX_FLUX_BATCH, MIN_FLUX_BATCH } from '@phybot/shared';
import { bus } from '../core/bus.js';
import { AppError, ConflictError, ExternalServiceError, NotFoundError } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import { getFluxConfig } from './config.js';
import {
  ensureFluxDirectories,
  fluxDir,
  fluxImagesDir,
  imagePath,
  isFluxInstalled,
  modelPath,
} from './paths.js';
import { fluxRepository } from './repository.js';
import { runGeneration, runUpscale } from './runner.js';

const log = createLogger('flux');

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
  requestedBy?: string;
}

function publishStatus(): void {
  bus.emit('flux:status', getFluxStatus());
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
      prompt: params.prompt,
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
        prompt: params.prompt,
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

export async function upscaleImage(id: number): Promise<FluxImage> {
  const image = getImage(id);
  if (image.upscaledFileName && existsSync(imageFilePath(image, 'upscaled'))) {
    return image;
  }
  assertReady();

  const config = getFluxConfig();
  if (!config.upscaleModel || !existsSync(modelPath(config.upscaleModel))) {
    throw new AppError(
      'flux_no_upscaler',
      `The upscale model (${config.upscaleModel || 'not configured'}) is missing from Flux/models. Run "npm run flux:setup".`,
      503,
    );
  }
  if (running) {
    throw new ConflictError('The generator is busy. Try again when the current job finishes.');
  }

  const source = imageFilePath(image);
  if (!existsSync(source)) throw new NotFoundError('The image file is gone');

  const outputName = `${basename(image.fileName, extname(image.fileName))}_upscaled.png`;
  running = true;
  publishStatus();

  try {
    await runUpscale(config, {
      inputPath: source,
      outputPath: imagePath(outputName),
      onProgress: (progress) => {
        bus.emit('flux:progress', {
          batchId: image.batchId,
          index: 1,
          total: 1,
          step: progress.step,
          totalSteps: progress.totalSteps,
          message: 'upscaling',
          at: Date.now(),
        });
      },
    });

    if (!existsSync(imagePath(outputName))) {
      throw new ExternalServiceError('flux', 'The upscaler finished without writing an image');
    }
    fluxRepository.setUpscaled(id, outputName);
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

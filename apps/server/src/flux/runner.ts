import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { FluxConfig } from '@phybot/shared';
import { ExternalServiceError } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import { fluxBinaryPath, modelPath } from './paths.js';

const log = createLogger('flux:runner');

/**
 * Wrapper around the stable-diffusion.cpp command line binary. Every argument
 * the rest of the module passes is a number or a name resolved inside the
 * models directory, so nothing user supplied reaches the command line except
 * the prompt, which is passed as its own argv entry and never through a shell.
 */

/** Generation is slow; this only guards against a hung process. */
const RUN_TIMEOUT_MS = 30 * 60 * 1000;

/** `[  4%] step 1/4 - 3.20s/it` style progress lines. */
const STEP_PATTERN = /(\d+)\s*\/\s*(\d+)\s*-\s*[\d.]+\s*(?:s\/it|it\/s)/i;

export interface RunProgress {
  step: number;
  totalSteps: number;
  message: string;
}

export interface GenerateRunOptions {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed: number;
  batchCount: number;
  /** Output template; `%d` is expanded by the binary for a batch. */
  outputPath: string;
  onProgress?: (progress: RunProgress) => void;
  signal?: AbortSignal;
}

function backendArgs(config: FluxConfig): string[] {
  switch (config.backend) {
    case 'cpu':
      return ['--backend', 'cpu'];
    case 'vulkan':
      return ['--backend', 'vulkan0'];
    case 'cuda':
    default:
      // Leaving the backend unset lets the CUDA build pick its own device,
      // which is what the prebuilt binaries expect.
      return [];
  }
}

function requireModel(fileName: string, label: string): string {
  const path = modelPath(fileName);
  if (!existsSync(path)) {
    throw new ExternalServiceError(
      'flux',
      `The ${label} file "${fileName}" is missing from Flux/models. Run "npm run flux:setup".`,
    );
  }
  return path;
}

function run(
  args: string[],
  options: { onProgress?: (p: RunProgress) => void; signal?: AbortSignal },
): Promise<void> {
  const binary = fluxBinaryPath();
  if (!existsSync(binary)) {
    throw new ExternalServiceError(
      'flux',
      'The image generator is not installed yet. Run "npm run flux:setup".',
    );
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let tail = '';
    let settled = false;

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };

    const onAbort = (): void => {
      child.kill('SIGKILL');
      finish(new ExternalServiceError('flux', 'Image generation was cancelled'));
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new ExternalServiceError('flux', 'Image generation timed out'));
    }, RUN_TIMEOUT_MS);

    const handleOutput = (chunk: Buffer): void => {
      const text = chunk.toString();
      tail = `${tail}${text}`.slice(-4000);
      if (!options.onProgress) return;

      for (const line of text.split(/\r?\n|\r/)) {
        const match = STEP_PATTERN.exec(line);
        if (!match?.[1] || !match[2]) continue;
        options.onProgress({
          step: Number(match[1]),
          totalSteps: Number(match[2]),
          message: `step ${match[1]}/${match[2]}`,
        });
      }
    };

    // The binary logs progress to stderr and results to stdout.
    child.stdout.on('data', handleOutput);
    child.stderr.on('data', handleOutput);

    child.on('error', (error) => {
      finish(new ExternalServiceError('flux', `Could not start the generator: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        finish();
        return;
      }
      const detail = tail
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /error|failed|cannot|unable|out of memory/i.test(line))
        .slice(-2)
        .join(' ');
      log.warn({ code }, `Generator exited with code ${code}`);
      finish(
        new ExternalServiceError(
          'flux',
          detail || `The generator exited with code ${String(code)}`,
        ),
      );
    });
  });
}

/**
 * Text encoder arguments. FLUX.2 reads its prompt with a single language model
 * (Qwen3), while FLUX.1 needs the CLIP and T5 pair, so the configured file
 * names decide which pipeline is used.
 */
export function textEncoderArgs(config: FluxConfig): string[] {
  if (config.llm) {
    return ['--llm', requireModel(config.llm, 'text encoder')];
  }
  return [
    '--clip_l',
    requireModel(config.clipL, 'CLIP text encoder'),
    '--t5xxl',
    requireModel(config.t5, 'T5 text encoder'),
  ];
}

/** Renders one prompt into `batchCount` images. */
export async function runGeneration(
  config: FluxConfig,
  options: GenerateRunOptions,
): Promise<void> {
  const args = [
    '-M',
    'img_gen',
    '--diffusion-model',
    requireModel(config.model, 'diffusion model'),
    ...textEncoderArgs(config),
    '--vae',
    requireModel(config.vae, 'VAE'),
    '-p',
    options.prompt,
    '-W',
    String(options.width),
    '-H',
    String(options.height),
    '--steps',
    String(options.steps),
    '--cfg-scale',
    String(options.cfgScale),
    '--sampling-method',
    config.sampler,
    '-s',
    String(options.seed),
    '-b',
    String(options.batchCount),
    '-o',
    options.outputPath,
    '-t',
    String(config.threads),
    ...backendArgs(config),
  ];

  if (options.negativePrompt) args.push('-n', options.negativePrompt);
  if (config.diffusionFlashAttention) args.push('--diffusion-fa');
  if (config.vaeTiling) args.push('--vae-tiling');
  if (config.offloadToCpu) args.push('--offload-to-cpu');

  await run(args, {
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export interface UpscaleRunOptions {
  inputPath: string;
  outputPath: string;
  /** Overrides the configured upscaler for this run. */
  model?: string;
  onProgress?: (progress: RunProgress) => void;
}

/** Enlarges an existing image with an ESRGAN model. */
export async function runUpscale(config: FluxConfig, options: UpscaleRunOptions): Promise<void> {
  const model = options.model || config.upscaleModel;
  if (!model) {
    throw new ExternalServiceError('flux', 'No upscale model is configured');
  }

  const args = [
    '-M',
    'upscale',
    '--upscale-model',
    requireModel(model, 'upscale model'),
    '-i',
    options.inputPath,
    '-o',
    options.outputPath,
    '-t',
    String(config.threads),
    ...backendArgs(config),
  ];

  await run(args, { ...(options.onProgress ? { onProgress: options.onProgress } : {}) });
}

export interface RefineRunOptions {
  inputPath: string;
  outputPath: string;
  prompt: string;
  width: number;
  height: number;
  /** How far the image may move from the input; low values keep the picture. */
  strength: number;
  steps: number;
  seed: number;
  onProgress?: (progress: RunProgress) => void;
  signal?: AbortSignal;
}

/**
 * Runs the diffusion model over an already enlarged image at low strength.
 *
 * An ESRGAN upscaler can only interpolate what is there, so a 4x enlargement of
 * a soft area stays soft. Denoising the result at around 0.3 lets the model draw
 * the detail in - stone that reads as stone rather than a smooth gradient - at
 * the cost of a full generation pass at the larger size.
 */
export async function runRefine(config: FluxConfig, options: RefineRunOptions): Promise<void> {
  const args = [
    '-M',
    'img_gen',
    '--diffusion-model',
    requireModel(config.model, 'diffusion model'),
    ...textEncoderArgs(config),
    '--vae',
    requireModel(config.vae, 'VAE'),
    '-i',
    options.inputPath,
    '--strength',
    options.strength.toFixed(2),
    '-p',
    options.prompt,
    '-W',
    String(options.width),
    '-H',
    String(options.height),
    '--steps',
    String(options.steps),
    '--cfg-scale',
    String(config.cfgScale),
    '--sampling-method',
    config.sampler,
    '-s',
    String(options.seed),
    '-o',
    options.outputPath,
    '-t',
    String(config.threads),
    ...backendArgs(config),
  ];

  if (config.diffusionFlashAttention) args.push('--diffusion-fa');
  // Always tiled: the refine pass runs at the enlarged size, where decoding the
  // image in one piece is what runs the card out of memory.
  args.push('--vae-tiling');
  if (config.offloadToCpu) args.push('--offload-to-cpu');

  await run(args, {
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export interface EditRunOptions {
  /** Images the model is asked to work from; the first is the one being edited. */
  referencePaths: string[];
  outputPath: string;
  prompt: string;
  width: number;
  height: number;
  steps: number;
  seed: number;
  batchCount: number;
  onProgress?: (progress: RunProgress) => void;
  signal?: AbortSignal;
}

/**
 * Edits an existing image from a written instruction. FLUX.2 takes the picture
 * as a reference rather than as a starting noise level, so the parts the
 * instruction does not mention stay as they were instead of drifting.
 */
export async function runEdit(config: FluxConfig, options: EditRunOptions): Promise<void> {
  const args = [
    '-M',
    'img_gen',
    '--diffusion-model',
    requireModel(config.model, 'diffusion model'),
    ...textEncoderArgs(config),
    '--vae',
    requireModel(config.vae, 'VAE'),
  ];

  for (const path of options.referencePaths) args.push('-r', path);
  // Numbers the references in the order given, which is what lets a prompt say
  // "put the object from the second image into the first".
  if (options.referencePaths.length > 1) args.push('--increase-ref-index');

  args.push(
    '-p',
    options.prompt,
    '-W',
    String(options.width),
    '-H',
    String(options.height),
    '--steps',
    String(options.steps),
    '--cfg-scale',
    String(config.cfgScale),
    '--sampling-method',
    config.sampler,
    '-s',
    String(options.seed),
    '-b',
    String(options.batchCount),
    '-o',
    options.outputPath,
    '-t',
    String(config.threads),
    ...backendArgs(config),
  );

  if (config.diffusionFlashAttention) args.push('--diffusion-fa');
  if (config.vaeTiling) args.push('--vae-tiling');
  if (config.offloadToCpu) args.push('--offload-to-cpu');

  await run(args, {
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

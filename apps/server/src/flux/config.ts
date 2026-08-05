import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { FluxConfig } from '@phybot/shared';
import { fluxConfigSchema } from '@phybot/shared';
import { createLogger } from '../core/logger.js';
import { ensureFluxDirectories, fluxConfigFile } from './paths.js';

const log = createLogger('flux:config');

/**
 * Defaults target FLUX.2-klein-4B: about 5 GB of weights, which fits an 8 GB
 * card without shuffling anything to system memory, at the four steps the
 * model is distilled for, and no classifier free guidance. FLUX.1 models still work: clear `llm` and fill in
 * `clipL` and `t5` instead.
 */
export const DEFAULT_FLUX_CONFIG: FluxConfig = {
  backend: 'cuda',
  model: 'flux-2-klein-4b-Q4_0.gguf',
  clipL: '',
  t5: '',
  llm: 'Qwen3-4B-Q4_K_M.gguf',
  vae: 'flux2-vae.safetensors',
  upscaleModel: 'RealESRGAN_x4plus.pth',
  steps: 4,
  cfgScale: 1,
  width: 1024,
  height: 1024,
  sampler: 'euler',
  threads: -1,
  diffusionFlashAttention: true,
  vaeTiling: true,
  offloadToCpu: false,
  keepUnsavedDays: 14,
};

let cached: FluxConfig | null = null;

function readFromDisk(): FluxConfig {
  if (!existsSync(fluxConfigFile)) return { ...DEFAULT_FLUX_CONFIG };

  try {
    const raw: unknown = JSON.parse(readFileSync(fluxConfigFile, 'utf8'));
    const parsed = fluxConfigSchema.safeParse(raw);
    if (!parsed.success) {
      log.warn('flux.config.json has invalid values; the defaults are used for those fields');
      return { ...DEFAULT_FLUX_CONFIG };
    }
    return { ...DEFAULT_FLUX_CONFIG, ...parsed.data };
  } catch (error) {
    log.warn(`Could not read flux.config.json: ${(error as Error).message}`);
    return { ...DEFAULT_FLUX_CONFIG };
  }
}

export function getFluxConfig(): FluxConfig {
  cached ??= readFromDisk();
  return cached;
}

/** Persists a patch so the settings survive a restart and stay editable by hand. */
export function updateFluxConfig(patch: Partial<FluxConfig>): FluxConfig {
  const next: FluxConfig = { ...getFluxConfig(), ...patch };
  ensureFluxDirectories();
  writeFileSync(fluxConfigFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  cached = next;
  return next;
}

/** Drops the cache so an edit made directly in the file is picked up. */
export function reloadFluxConfig(): FluxConfig {
  cached = null;
  return getFluxConfig();
}

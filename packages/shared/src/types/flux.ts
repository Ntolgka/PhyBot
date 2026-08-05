/** Local text-to-image generation with FLUX, run by stable-diffusion.cpp. */

export const FLUX_BACKENDS = ['cuda', 'vulkan', 'cpu'] as const;
export type FluxBackend = (typeof FLUX_BACKENDS)[number];

/** Images a single prompt may produce in one go. */
export const MIN_FLUX_BATCH = 1;
export const MAX_FLUX_BATCH = 4;

export interface FluxImage {
  id: number;
  /** Groups the images produced by one prompt. */
  batchId: string;
  indexInBatch: number;
  prompt: string;
  negativePrompt: string;
  seed: number;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  /** File name inside the images directory; never a client supplied path. */
  fileName: string;
  /** Set once an upscaled copy exists. */
  upscaledFileName: string | null;
  /** Kept images survive the cleanup of old generations. */
  saved: boolean;
  durationMs: number;
  /** Who asked for it: a Discord user id, or "dashboard". */
  requestedBy: string;
  createdAt: number;
}

export interface FluxConfig {
  backend: FluxBackend;
  /** Model file names, resolved inside the Flux models directory. */
  model: string;
  /** FLUX.1 text encoders; leave empty when using a FLUX.2 model. */
  clipL: string;
  t5: string;
  /** FLUX.2 text encoder (Qwen3). Setting this selects the FLUX.2 pipeline. */
  llm: string;
  vae: string;
  upscaleModel: string;
  steps: number;
  cfgScale: number;
  width: number;
  height: number;
  sampler: string;
  /** CPU threads; -1 lets the runtime decide. */
  threads: number;
  /** Flash attention in the diffusion model, saves memory. */
  diffusionFlashAttention: boolean;
  /** Decodes the image in tiles, needed on smaller cards. */
  vaeTiling: boolean;
  /** Moves weights to system RAM between steps when VRAM is tight. */
  offloadToCpu: boolean;
  /** Unsaved images older than this are removed; 0 keeps everything. */
  keepUnsavedDays: number;
}

export interface FluxStatus {
  /** The stable-diffusion.cpp binary is present and runnable. */
  installed: boolean;
  /** Every model file named in the configuration exists. */
  modelsReady: boolean;
  backend: FluxBackend;
  /** Human readable list of what still has to be downloaded. */
  missing: string[];
  busy: boolean;
  queued: number;
  lastError: string | null;
  /** Where the setup script puts everything, shown in the dashboard. */
  directory: string;
}

export interface FluxProgress {
  batchId: string;
  /** 1-based position of the image being rendered. */
  index: number;
  total: number;
  step: number;
  totalSteps: number;
  /** Short status line, for example "decoding" or "step 3/4". */
  message: string;
  at: number;
}

export interface FluxGenerationResult {
  batchId: string;
  images: FluxImage[];
}

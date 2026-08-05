import { existsSync, mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { rootDir } from '../core/config.js';

/**
 * Everything the image generator needs lives under Flux/ in the project
 * folder: the runtime binary, the model weights, the configuration and the
 * generated images.
 */
export const fluxDir = resolve(rootDir, 'Flux');
export const fluxBinDir = resolve(fluxDir, 'bin');
export const fluxModelsDir = resolve(fluxDir, 'models');
export const fluxImagesDir = resolve(fluxDir, 'Images');
export const fluxConfigFile = resolve(fluxDir, 'flux.config.json');

/** The stable-diffusion.cpp command line binary. */
export function fluxBinaryPath(): string {
  return resolve(fluxBinDir, process.platform === 'win32' ? 'sd-cli.exe' : 'sd-cli');
}

export function isFluxInstalled(): boolean {
  return existsSync(fluxBinaryPath());
}

export function ensureFluxDirectories(): void {
  for (const dir of [fluxDir, fluxBinDir, fluxModelsDir, fluxImagesDir]) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Resolves a configured model file name inside the models directory. Only the
 * base name is used, so a value from the configuration file or the dashboard
 * can never point outside that directory.
 */
export function modelPath(fileName: string): string {
  return resolve(fluxModelsDir, basename(fileName));
}

/** Same containment rule for generated images. */
export function imagePath(fileName: string): string {
  return resolve(fluxImagesDir, basename(fileName));
}

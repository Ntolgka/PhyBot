import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { AppError, ExternalServiceError } from '../core/errors.js';

const ffmpegPath = ffmpegStatic as unknown as string | null;

/** Sizes the diffusion model works at; anything larger is scaled down first. */
const MAX_SIDE = 1536;
/** Both sides have to be a multiple of this for the model to accept them. */
const SIZE_STEP = 64;
const MIN_SIDE = 256;

export interface PreparedImage {
  png: Buffer;
  width: number;
  height: number;
}

/**
 * Largest side the refine pass can run at.
 *
 * Refining works on the enlarged image, and the attention cost grows with the
 * pixel count: 2048 completes in about two minutes on an 8 GB card, while 4096
 * fails outright with "sampling failed" after a few seconds. A four times
 * upscale of a 1024 image is therefore scaled back to this before the pass.
 */
export const REFINE_MAX_SIDE = 2048;

/** Reads the dimensions out of a PNG header. */
function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || png.readUInt32BE(12) !== 0x49484452) {
    throw new ExternalServiceError('flux', 'The converted image is not a readable PNG');
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * Picks the size the edit runs at: the source proportions, capped so the long
 * side fits the model, and rounded to a multiple of 64 because the latent grid
 * cannot represent anything else.
 */
export function fitToModel(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const round = (value: number): number =>
    Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.round((value * scale) / SIZE_STEP) * SIZE_STEP));
  return { width: round(width), height: round(height) };
}

/**
 * Converts whatever the user sent - PNG, JPEG, WebP, a screenshot pasted into
 * Discord - into a plain PNG at a size the model accepts. Going through ffmpeg
 * rather than trusting the upload also means a malformed file fails here, with
 * a clear message, instead of inside the generator.
 */
export function prepareInputImage(input: Buffer): Promise<PreparedImage> {
  if (!ffmpegPath) {
    return Promise.reject(new ExternalServiceError('flux', 'The bundled ffmpeg binary is missing'));
  }
  if (input.length === 0) {
    return Promise.reject(new AppError('flux_empty_image', 'The image is empty', 400));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-frames:v',
        '1',
        // Scales only when the image is over the cap, then rounds both sides to
        // the step the model needs.
        '-vf',
        `scale='min(${MAX_SIDE},iw)':'min(${MAX_SIDE},ih)':force_original_aspect_ratio=decrease,scale='round(iw/${SIZE_STEP})*${SIZE_STEP}':'round(ih/${SIZE_STEP})*${SIZE_STEP}'`,
        '-f',
        'image2',
        '-c:v',
        'png',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );

    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-300);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const png = Buffer.concat(chunks);
      if (code !== 0 || png.length === 0) {
        reject(
          new AppError(
            'flux_bad_image',
            stderr.trim() || 'That file could not be read as an image',
            400,
          ),
        );
        return;
      }
      try {
        resolve({ png, ...pngSize(png) });
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.on('error', () => {
      // ffmpeg rejecting the input closes stdin early; the close handler reports it.
    });
    child.stdin.end(input);
  });
}

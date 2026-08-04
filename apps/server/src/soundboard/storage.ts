import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import {
  MAX_SOUND_DURATION_SECONDS,
  MAX_SOUND_UPLOAD_BYTES,
  SUPPORTED_SOUND_TYPES,
} from '@phybot/shared';
import { config } from '../core/config.js';
import { AppError, ExternalServiceError } from '../core/errors.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('soundboard');

// ffmpeg-static exports the binary path directly; its typings describe it as
// a module namespace, so the value is narrowed here once (mirrors audioStream.ts).
const ffmpegPath = ffmpegStatic as unknown as string | null;

type SupportedSoundType = (typeof SUPPORTED_SOUND_TYPES)[number];

const EXTENSION_BY_MIME: Record<SupportedSoundType, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
};

function isSupportedSoundType(mime: string): mime is SupportedSoundType {
  return (SUPPORTED_SOUND_TYPES as readonly string[]).includes(mime);
}

export interface ParsedSoundUpload {
  mime: SupportedSoundType;
  buffer: Buffer;
}

/**
 * Decodes and validates a client-supplied `data:<mime>;base64,<data>` upload.
 * The declared mime type is checked against the shared allow-list and the
 * decoded size against the shared upload limit; nothing here trusts the
 * client's own file name.
 */
export function parseSoundDataUrl(dataUrl: string): ParsedSoundUpload {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl.trim());
  if (!match) {
    throw new AppError('invalid_upload', 'The uploaded file is not a valid audio data URL', 400);
  }

  const mime = match[1];
  const base64 = match[2];
  if (!mime || !base64) {
    throw new AppError('invalid_upload', 'The uploaded file is not a valid audio data URL', 400);
  }
  if (!isSupportedSoundType(mime)) {
    throw new AppError(
      'unsupported_type',
      'Upload an mp3, ogg, wav, m4a, aac, flac or webm audio file',
      400,
    );
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) {
    throw new AppError('invalid_upload', 'The uploaded file is empty', 400);
  }
  if (buffer.length > MAX_SOUND_UPLOAD_BYTES) {
    throw new AppError(
      'file_too_large',
      `Files must be ${Math.floor(MAX_SOUND_UPLOAD_BYTES / (1024 * 1024))} MB or smaller`,
      400,
    );
  }

  return { mime, buffer };
}

/** File extension used for the stored clip; never derived from client input. */
export function extensionForMime(mime: SupportedSoundType): string {
  return EXTENSION_BY_MIME[mime];
}

/**
 * Generates the on-disk file name for a clip. This intentionally has no way
 * to accept a client-supplied name, which is what makes a payload such as
 * `../../evil.mp3` structurally unable to influence the stored path.
 */
export function generateSoundFileName(mime: SupportedSoundType): string {
  return `${randomUUID()}.${extensionForMime(mime)}`;
}

function soundsDir(): string {
  return resolve(config.dataDir, 'sounds');
}

function soundFilePath(fileName: string): string {
  return resolve(soundsDir(), fileName);
}

export function soundFileAbsolutePath(fileName: string): string {
  return soundFilePath(fileName);
}

const DURATION_PATTERN = /Duration:\s*(\d+):(\d{2}):(\d{2})\.(\d+)/;

/** Probes a file's real duration with the bundled ffmpeg. Rejects anything
 * ffmpeg cannot decode, which also rejects files that are not really audio. */
function probeDurationMs(filePath: string): Promise<number> {
  if (!ffmpegPath) {
    return Promise.reject(
      new ExternalServiceError('ffmpeg', 'The bundled ffmpeg binary is missing'),
    );
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-i', filePath, '-f', 'null', '-'], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-2000);
    });
    child.on('error', (error) => {
      reject(new ExternalServiceError('ffmpeg', error.message));
    });
    child.on('close', () => {
      const match = DURATION_PATTERN.exec(stderr);
      if (!match) {
        reject(new AppError('invalid_audio', 'The file could not be read as audio', 400));
        return;
      }
      const [, hours, minutes, seconds, fraction] = match;
      const millis = Number(`${fraction ?? '0'}00`.slice(0, 3));
      const totalMs =
        (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000 + millis;
      resolvePromise(totalMs);
    });
  });
}

export interface SavedSound {
  fileName: string;
  sizeBytes: number;
  durationMs: number;
}

/**
 * Writes the clip to disk and probes its real duration with ffmpeg, rejecting
 * anything longer than the configured limit or that ffmpeg cannot decode.
 * The partial file is removed again when validation fails after the write.
 */
export async function saveSoundFile(dataUrl: string): Promise<SavedSound> {
  const { mime, buffer } = parseSoundDataUrl(dataUrl);
  const fileName = generateSoundFileName(mime);
  await mkdir(soundsDir(), { recursive: true });
  const filePath = soundFilePath(fileName);
  await writeFile(filePath, buffer);

  try {
    const durationMs = await probeDurationMs(filePath);
    if (durationMs > MAX_SOUND_DURATION_SECONDS * 1000) {
      throw new AppError(
        'clip_too_long',
        `Clips must be ${MAX_SOUND_DURATION_SECONDS} seconds or shorter`,
        400,
      );
    }
    return { fileName, sizeBytes: buffer.length, durationMs };
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }
}

/** Removes a stored clip's file. A missing file is not treated as an error. */
export async function deleteSoundFile(fileName: string): Promise<void> {
  try {
    await unlink(soundFilePath(fileName));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      log.warn({ fileName, err: error }, 'Could not delete a soundboard clip file');
    }
  }
}

export async function readSoundFile(fileName: string): Promise<Buffer> {
  return readFile(soundFilePath(fileName));
}

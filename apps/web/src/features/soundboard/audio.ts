import { MAX_SOUND_UPLOAD_BYTES, SUPPORTED_SOUND_TYPES } from '@phybot/shared';

/** Validates an audio file against the shared upload constraints before it is
 * ever read into memory. Returns an error message, or null when acceptable. */
export function validateSoundFile(file: File): string | null {
  if (!SUPPORTED_SOUND_TYPES.includes(file.type as (typeof SUPPORTED_SOUND_TYPES)[number])) {
    return 'Unsupported file type. Use MP3, OGG, WAV, M4A, AAC, FLAC or WebM audio.';
  }
  if (file.size > MAX_SOUND_UPLOAD_BYTES) {
    return `File is too large. Maximum size is ${Math.floor(MAX_SOUND_UPLOAD_BYTES / (1024 * 1024))} MB.`;
  }
  return null;
}

/** Reads a File as a base64 data URL, matching the format the API expects. */
export function readSoundFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

/** Reads a clip's duration client-side for instant feedback in the upload
 * form. The server is the source of truth: it re-probes the file with
 * ffmpeg, so a browser that cannot report a duration is not fatal here. */
export function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolvePromise) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = (): void => URL.revokeObjectURL(url);
    audio.addEventListener('loadedmetadata', () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : null;
      cleanup();
      resolvePromise(duration);
    });
    audio.addEventListener('error', () => {
      cleanup();
      resolvePromise(null);
    });
    audio.src = url;
  });
}

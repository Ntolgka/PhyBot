import { MAX_IMAGE_UPLOAD_BYTES, SUPPORTED_IMAGE_TYPES } from '@phybot/shared';
import { bytesToDataSize } from './format';

/** Validates a file against the shared upload constraints before it's ever
 * read into memory. Returns an error message, or null when the file is
 * acceptable. */
export function validateImageFile(file: File): string | null {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type as (typeof SUPPORTED_IMAGE_TYPES)[number])) {
    return 'Unsupported file type. Use PNG, JPEG, GIF or WebP.';
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return `File is too large. Maximum size is ${bytesToDataSize(MAX_IMAGE_UPLOAD_BYTES)}.`;
  }
  return null;
}

/** Reads a File as a base64 data URL, matching the format the API expects. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

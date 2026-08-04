import { describe, expect, it } from 'vitest';
import { MAX_SOUND_UPLOAD_BYTES, SUPPORTED_SOUND_TYPES } from '@phybot/shared';
import { AppError } from '../core/errors.js';
import { extensionForMime, generateSoundFileName, parseSoundDataUrl } from './storage.js';

function dataUrlFor(mime: string, payload: Buffer): string {
  return `data:${mime};base64,${payload.toString('base64')}`;
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof AppError ? error.code : null;
  }
}

describe('parseSoundDataUrl', () => {
  it('decodes a supported audio type back to its original bytes', () => {
    const payload = Buffer.from('fake mp3 bytes');
    const { mime, buffer } = parseSoundDataUrl(dataUrlFor('audio/mpeg', payload));
    expect(mime).toBe('audio/mpeg');
    expect(buffer.equals(payload)).toBe(true);
  });

  it('accepts every mime type in the shared allow-list', () => {
    for (const mime of SUPPORTED_SOUND_TYPES) {
      const payload = Buffer.from('clip');
      expect(() => parseSoundDataUrl(dataUrlFor(mime, payload))).not.toThrow();
    }
  });

  it('rejects a mime type outside the allow-list', () => {
    const payload = Buffer.from('not audio');
    expect(codeOf(() => parseSoundDataUrl(dataUrlFor('image/png', payload)))).toBe(
      'unsupported_type',
    );
  });

  it('rejects a string that is not a data URL at all', () => {
    expect(codeOf(() => parseSoundDataUrl('not-a-data-url'))).toBe('invalid_upload');
  });

  it('rejects an empty payload', () => {
    expect(codeOf(() => parseSoundDataUrl('data:audio/mpeg;base64,'))).toBe('invalid_upload');
  });

  it('rejects a payload larger than the shared upload limit', () => {
    const oversized = Buffer.alloc(MAX_SOUND_UPLOAD_BYTES + 1024, 1);
    expect(codeOf(() => parseSoundDataUrl(dataUrlFor('audio/mpeg', oversized)))).toBe(
      'file_too_large',
    );
  });

  it('accepts a payload right at the upload limit', () => {
    const exact = Buffer.alloc(MAX_SOUND_UPLOAD_BYTES, 1);
    expect(() => parseSoundDataUrl(dataUrlFor('audio/mpeg', exact))).not.toThrow();
  });
});

describe('extensionForMime', () => {
  it('maps every supported mime type to a plausible lowercase extension', () => {
    for (const mime of SUPPORTED_SOUND_TYPES) {
      expect(extensionForMime(mime)).toMatch(/^[a-z0-9]+$/);
    }
  });

  it('maps the ambiguous mp3 aliases to the same extension', () => {
    expect(extensionForMime('audio/mpeg')).toBe('mp3');
    expect(extensionForMime('audio/mp3')).toBe('mp3');
  });
});

describe('generateSoundFileName', () => {
  it('has no parameter for a client file name, so a path traversal payload can never reach it', () => {
    // generateSoundFileName(mime) only accepts a whitelisted mime type - there
    // is no code path through which a string like "../../evil.mp3" supplied
    // by a client could ever become part of the generated name.
    expect(generateSoundFileName.length).toBe(1);
  });

  it('produces a UUID-based name with no path separators or traversal sequences', () => {
    const fileName = generateSoundFileName('audio/mpeg');
    expect(fileName).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$/);
    expect(fileName).not.toContain('..');
    expect(fileName).not.toContain('/');
    expect(fileName).not.toContain('\\');
  });

  it('produces a different name on every call', () => {
    const a = generateSoundFileName('audio/wav');
    const b = generateSoundFileName('audio/wav');
    expect(a).not.toBe(b);
  });

  it('uses the extension that matches the mime type', () => {
    expect(generateSoundFileName('audio/flac')).toMatch(/\.flac$/);
    expect(generateSoundFileName('audio/mp4')).toMatch(/\.m4a$/);
    expect(generateSoundFileName('audio/webm')).toMatch(/\.webm$/);
  });
});

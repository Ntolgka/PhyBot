import { describe, expect, it } from 'vitest';
import { downmixForSpeech, pcmToWav } from './audioStream.js';

/** Builds 48 kHz stereo PCM from per-channel sample pairs. */
function stereo(frames: [number, number][]): Buffer {
  const buffer = Buffer.alloc(frames.length * 4);
  frames.forEach(([left, right], index) => {
    buffer.writeInt16LE(left, index * 4);
    buffer.writeInt16LE(right, index * 4 + 2);
  });
  return buffer;
}

describe('downmixForSpeech', () => {
  it('turns three stereo frames into one mono sample', () => {
    const pcm = downmixForSpeech(
      stereo([
        [100, 200],
        [300, 400],
        [500, 600],
      ]),
    );
    expect(pcm).toHaveLength(2);
    expect(pcm.readInt16LE(0)).toBe(350);
  });

  it('drops a trailing partial frame group instead of reading past the end', () => {
    const pcm = downmixForSpeech(
      stereo([
        [1, 1],
        [1, 1],
        [1, 1],
        [1, 1],
      ]),
    );
    expect(pcm).toHaveLength(2);
  });

  it('clamps sums that would overflow a 16-bit sample', () => {
    const pcm = downmixForSpeech(
      stereo([
        [32767, 32767],
        [32767, 32767],
        [32767, 32767],
      ]),
    );
    expect(pcm.readInt16LE(0)).toBe(32767);
  });

  it('produces a WAV header that describes 16 kHz mono', () => {
    const wav = pcmToWav(
      downmixForSpeech(stereo(Array.from({ length: 300 }, () => [10, 20]))),
      16_000,
      1,
    );
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(16_000);
    // Byte rate for one 16-bit channel at 16 kHz.
    expect(wav.readUInt32LE(28)).toBe(32_000);
    expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
  });
});

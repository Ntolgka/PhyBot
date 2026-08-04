import { describe, expect, it } from 'vitest';
import { scalePcmVolume } from './volume.js';

function pcmOf(samples: number[]): Buffer {
  const buffer = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, index * 2));
  return buffer;
}

describe('scalePcmVolume', () => {
  it('returns the exact same buffer at factor 1 (no-op fast path)', () => {
    const pcm = pcmOf([1000, -1000, 32000]);
    expect(scalePcmVolume(pcm, 1)).toBe(pcm);
  });

  it('halves sample amplitude at factor 0.5', () => {
    const pcm = pcmOf([1000, -1000]);
    const scaled = scalePcmVolume(pcm, 0.5);
    expect(scaled.readInt16LE(0)).toBe(500);
    expect(scaled.readInt16LE(2)).toBe(-500);
  });

  it('leaves silence untouched', () => {
    const pcm = pcmOf([0, 0]);
    const scaled = scalePcmVolume(pcm, 1.5);
    expect(scaled.readInt16LE(0)).toBe(0);
    expect(scaled.readInt16LE(2)).toBe(0);
  });

  it('clamps to the 16-bit signed range instead of overflowing', () => {
    const pcm = pcmOf([30000, -30000]);
    const scaled = scalePcmVolume(pcm, 2);
    expect(scaled.readInt16LE(0)).toBe(32767);
    expect(scaled.readInt16LE(2)).toBe(-32768);
  });

  it('treats a negative factor as silence rather than inverting the waveform', () => {
    const pcm = pcmOf([1000, -1000]);
    const scaled = scalePcmVolume(pcm, -1);
    expect(scaled.readInt16LE(0)).toBe(0);
    expect(scaled.readInt16LE(2)).toBe(0);
  });

  it('does not mutate the source buffer', () => {
    const pcm = pcmOf([1000]);
    const original = Buffer.from(pcm);
    scalePcmVolume(pcm, 0.5);
    expect(pcm.equals(original)).toBe(true);
  });

  it('leaves an incomplete trailing sample as zero rather than reading out of bounds', () => {
    const pcm = Buffer.concat([pcmOf([1000]), Buffer.from([0x7f])]);
    const scaled = scalePcmVolume(pcm, 0.5);
    expect(scaled.length).toBe(pcm.length);
    expect(scaled[2]).toBe(0);
  });
});

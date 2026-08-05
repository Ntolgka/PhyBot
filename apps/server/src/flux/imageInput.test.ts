import { describe, expect, it } from 'vitest';
import { fitToModel, REFINE_MAX_SIDE } from './imageInput.js';

describe('fitToModel', () => {
  it('leaves a size the model already accepts alone', () => {
    expect(fitToModel(1024, 1024)).toEqual({ width: 1024, height: 1024 });
  });

  it('scales an oversized image down without distorting it', () => {
    const { width, height } = fitToModel(4000, 3000);
    expect(Math.max(width, height)).toBeLessThanOrEqual(1536);
    // 4:3 within the rounding the latent grid forces.
    expect(width / height).toBeCloseTo(4 / 3, 1);
  });

  it('rounds both sides to a multiple of 64', () => {
    for (const [w, h] of [
      [700, 460],
      [1023, 769],
      [333, 999],
    ] as const) {
      const size = fitToModel(w, h);
      expect(size.width % 64).toBe(0);
      expect(size.height % 64).toBe(0);
    }
  });

  it('never returns a side below the minimum the model handles', () => {
    const size = fitToModel(40, 30);
    expect(size.width).toBeGreaterThanOrEqual(256);
    expect(size.height).toBeGreaterThanOrEqual(256);
  });

  it('keeps the refine cap under the size that fails to sample', () => {
    // 4096 fails outright on an 8 GB card; the cap has to stay below it.
    expect(REFINE_MAX_SIDE).toBeLessThan(4096);
    expect(REFINE_MAX_SIDE % 64).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { AppError } from '../../core/errors.js';
import { parseTimestamp } from './helpers.js';

describe('parseTimestamp', () => {
  it('reads plain seconds', () => {
    expect(parseTimestamp('90')).toBe(90);
    expect(parseTimestamp(' 12.5 ')).toBe(12.5);
  });

  it('reads minutes and seconds', () => {
    expect(parseTimestamp('1:30')).toBe(90);
  });

  it('reads hours, minutes and seconds', () => {
    expect(parseTimestamp('1:02:03')).toBe(3723);
  });

  it('rejects anything else', () => {
    expect(() => parseTimestamp('soon')).toThrow(AppError);
    expect(() => parseTimestamp('1:2:3:4')).toThrow(AppError);
  });
});

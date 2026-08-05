import { describe, expect, it } from 'vitest';
import { applyStyle } from './style.js';

describe('applyStyle', () => {
  it('leaves the prompt alone when no style is chosen', () => {
    expect(applyStyle('a lighthouse', undefined)).toBe('a lighthouse');
    expect(applyStyle('a lighthouse', 'none')).toBe('a lighthouse');
  });

  it('appends the style wording after a comma', () => {
    const result = applyStyle('a lighthouse', 'photo');
    expect(result.startsWith('a lighthouse, ')).toBe(true);
    expect(result).toContain('photograph');
  });

  it('does not add a second comma when the prompt already ends in punctuation', () => {
    expect(applyStyle('a lighthouse,', 'anime')).not.toContain(',,');
    expect(applyStyle('a lighthouse.', 'anime')).toContain('. anime');
  });

  it('trims trailing whitespace before appending', () => {
    expect(applyStyle('a lighthouse   ', 'anime')).toContain('lighthouse, anime');
  });

  it('gives every style its own wording', () => {
    const styles = ['photo', 'cinematic', 'illustration', 'anime', 'render3d'] as const;
    const results = styles.map((style) => applyStyle('x', style));
    expect(new Set(results).size).toBe(styles.length);
    for (const result of results) expect(result.length).toBeGreaterThan(20);
  });
});

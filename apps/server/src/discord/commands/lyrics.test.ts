import { describe, expect, it } from 'vitest';
import { renderLyrics } from './lyrics.js';

const lines = Array.from({ length: 12 }, (_, index) => ({ at: index * 10, text: `line ${index}` }));

describe('renderLyrics', () => {
  it('shows the whole song and bolds only the line being sung', () => {
    const out = renderLyrics(lines, 35).split('\n');
    expect(out).toHaveLength(lines.length);
    expect(out.filter((line) => line.startsWith('**'))).toEqual(['**line 3**']);
  });

  it('bolds nothing before the first line starts', () => {
    const out = renderLyrics([{ at: 5, text: 'first' }], 1);
    expect(out).toBe('first');
  });

  it('keeps the current line visible when the song is too long to fit', () => {
    const long = Array.from({ length: 400 }, (_, index) => ({
      at: index * 5,
      text: `a rather long lyric line number ${index} with plenty of words in it`,
    }));
    const out = renderLyrics(long, 350 * 5);
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(out).toContain('**a rather long lyric line number 350');
  });

  it('renders an instrumental gap without collapsing the line', () => {
    expect(renderLyrics([{ at: 0, text: '' }], 1)).toBe('**...**');
  });
});

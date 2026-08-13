import { describe, expect, it } from 'vitest';
import { renderKaraoke } from './karaoke.js';
import type { LyricLine } from '../music/lyrics.js';

const lines: LyricLine[] = Array.from({ length: 20 }, (_, index) => ({
  at: index * 3,
  text: `line ${index}`,
}));

describe('renderKaraoke', () => {
  it('marks the line being sung and dims the rest', () => {
    const out = renderKaraoke(lines, 5).split('\n');
    expect(out).toContain('### line 5');
    expect(out).toContain('-# line 4');
    expect(out).toContain('-# line 6');
  });

  it('keeps a window rather than the whole song', () => {
    // A full song redrawn every few seconds is unreadable and a large edit.
    expect(renderKaraoke(lines, 10).split('\n')).toHaveLength(7);
  });

  it('says so during the intro, when no line is due yet', () => {
    // lineAt returns -1 before the first timestamp, which must not render as
    // a window around line -1.
    const out = renderKaraoke(lines, -1);
    expect(out).toContain('(intro)');
    expect(out).not.toContain('###');
  });

  it('does not run past the start or the end', () => {
    expect(renderKaraoke(lines, 0)).toContain('### line 0');
    const last = renderKaraoke(lines, lines.length - 1);
    expect(last).toContain('### line 19');
    expect(last).not.toContain('undefined');
  });

  it('handles a song with no words at all', () => {
    expect(renderKaraoke([], 0)).toContain('No words');
  });
});

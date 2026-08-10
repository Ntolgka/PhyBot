import { describe, expect, it } from 'vitest';
import { lineAt, parseLrc, pickBestMatch, trackSearchTerms } from './lyrics.js';

describe('trackSearchTerms', () => {
  it('prefers the artist written in the title over the uploading channel', () => {
    expect(
      trackSearchTerms({ title: 'Cansever - Kime Bu İnat(Offical Video)', author: 'Ateş Müzik' }),
    ).toEqual({ artist: 'Cansever', title: 'Kime Bu İnat' });
  });

  it('keeps the song when a bracketed tag follows it', () => {
    // Regression: a dash used to be able to open a noise group, so this
    // collapsed to "Seçkin Türk" and matched a different song.
    expect(
      trackSearchTerms({ title: 'Seçkin Türk - Sigara (Akustik 2023)', author: 'Seçkin Türk' }),
    ).toEqual({ artist: 'Seçkin Türk', title: 'Sigara' });
  });

  it('drops a trailing pipe segment', () => {
    expect(
      trackSearchTerms({ title: 'manifest - Hileli | Special Dance Video', author: 'manifest' }),
    ).toEqual({ artist: 'manifest', title: 'Hileli' });
  });

  it('strips decoration when there is no artist in the title', () => {
    expect(
      trackSearchTerms({ title: 'Değirmenci Dayı (BASS BOOSTED)', author: 'Coşkun Pier' }),
    ).toEqual({ artist: 'Coşkun Pier', title: 'Değirmenci Dayı' });
  });

  it('drops a featured artist from the title', () => {
    expect(trackSearchTerms({ title: 'Song Name feat. Someone', author: 'Artist' })).toEqual({
      artist: 'Artist',
      title: 'Song Name',
    });
  });

  it('leaves a title that is only a dash-free name alone', () => {
    expect(trackSearchTerms({ title: 'Yalan Dünya', author: 'Neşet Ertaş' })).toEqual({
      artist: 'Neşet Ertaş',
      title: 'Yalan Dünya',
    });
  });
});

describe('parseLrc', () => {
  it('reads timestamps into seconds', () => {
    expect(parseLrc('[00:30.75] One more time')).toEqual([{ at: 30.75, text: 'One more time' }]);
  });

  it('handles millisecond precision as well as hundredths', () => {
    expect(parseLrc('[01:02.500] x')[0]?.at).toBeCloseTo(62.5, 3);
    expect(parseLrc('[01:02.50] x')[0]?.at).toBeCloseTo(62.5, 3);
  });

  it('expands a line that repeats at several times, in order', () => {
    expect(parseLrc('[00:20.00][00:10.00] chorus')).toEqual([
      { at: 10, text: 'chorus' },
      { at: 20, text: 'chorus' },
    ]);
  });

  it('ignores metadata tags that are not lyrics', () => {
    expect(parseLrc('[ar:Artist]\n[length:03:21]\n[00:01.00] first')).toEqual([
      { at: 1, text: 'first' },
    ]);
  });

  it('keeps instrumental gaps as empty lines', () => {
    expect(parseLrc('[00:05.00]')).toEqual([{ at: 5, text: '' }]);
  });
});

describe('pickBestMatch', () => {
  const synced = { syncedLyrics: '[00:01.00] a' };

  it('prefers timed lyrics over untimed', () => {
    const best = pickBestMatch(
      [
        { plainLyrics: 'a', duration: 200 },
        { ...synced, duration: 200 },
      ],
      200,
    );
    expect(best?.syncedLyrics).toBeDefined();
  });

  it('prefers the version whose length matches the track', () => {
    // Searching a folk song returns rap remixes first; the length is what
    // separates the original from a cover.
    const best = pickBestMatch(
      [
        { ...synced, duration: 150, trackName: 'remix' },
        { ...synced, duration: 384, trackName: 'original' },
      ],
      384,
    );
    expect(best?.trackName).toBe('original');
  });

  it('ignores entries with no lyrics at all', () => {
    expect(pickBestMatch([{ duration: 200, instrumental: true }], 200)).toBeNull();
  });

  it('returns null for an empty result set', () => {
    expect(pickBestMatch([], 200)).toBeNull();
  });
});

describe('lineAt', () => {
  const lines = [
    { at: 0, text: 'a' },
    { at: 10, text: 'b' },
    { at: 20, text: 'c' },
  ];

  it('finds the line that is being sung', () => {
    expect(lineAt(lines, 0)).toBe(0);
    expect(lineAt(lines, 9.9)).toBe(0);
    expect(lineAt(lines, 10)).toBe(1);
    expect(lineAt(lines, 999)).toBe(2);
  });

  it('reports nothing before the first line starts', () => {
    expect(lineAt([{ at: 5, text: 'a' }], 1)).toBe(-1);
  });
});

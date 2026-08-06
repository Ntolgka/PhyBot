import { describe, expect, it } from 'vitest';
import { extractYouTubeId, isPlayableEntry } from './resolver.js';
import { parseSpotifyUrl } from './spotify.js';

describe('isPlayableEntry', () => {
  it('accepts a normal video result', () => {
    expect(
      isPlayableEntry({
        ie_key: 'Youtube',
        duration: 117,
        title: 'Wegh - Halef Selef',
        url: 'https://www.youtube.com/watch?v=Vxm666Lk1ms',
      }),
    ).toBe(true);
  });

  it('rejects the artist channel that a name search returns first', () => {
    // This one was queued as a track and made yt-dlp enumerate the whole
    // channel until it timed out.
    expect(
      isPlayableEntry({
        ie_key: 'YoutubeTab',
        title: 'Wegh',
        url: 'https://www.youtube.com/channel/UCx_EXk9I29_iIT0YZVAlpMA',
      }),
    ).toBe(false);
  });

  it('rejects channel URLs in every form YouTube uses', () => {
    for (const url of [
      'https://www.youtube.com/@wegh',
      'https://www.youtube.com/c/wegh',
      'https://www.youtube.com/user/wegh',
      'https://www.youtube.com/playlist?list=PL123',
    ]) {
      expect(isPlayableEntry({ ie_key: 'Youtube', url })).toBe(false);
    }
  });

  it('rejects SoundCloud sets and profile listings', () => {
    expect(
      isPlayableEntry({ ie_key: 'Soundcloud', url: 'https://soundcloud.com/artist/sets/album' }),
    ).toBe(false);
    expect(
      isPlayableEntry({ ie_key: 'Soundcloud', url: 'https://soundcloud.com/artist/a-song' }),
    ).toBe(true);
  });

  it('rejects anything typed as a playlist', () => {
    expect(isPlayableEntry({ _type: 'playlist', url: 'https://example.com/x' })).toBe(false);
  });
});

describe('extractYouTubeId', () => {
  it('reads the id from a watch link', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=NAHRpEqgcL4')).toBe('NAHRpEqgcL4');
  });

  it('reads the id from a short link', () => {
    expect(extractYouTubeId('https://youtu.be/NAHRpEqgcL4')).toBe('NAHRpEqgcL4');
  });

  it('reads the id from shorts, embed and live paths', () => {
    expect(extractYouTubeId('https://www.youtube.com/shorts/abc123')).toBe('abc123');
    expect(extractYouTubeId('https://www.youtube.com/embed/abc123')).toBe('abc123');
    expect(extractYouTubeId('https://www.youtube.com/live/abc123')).toBe('abc123');
  });

  it('ignores other hosts and plain text', () => {
    expect(extractYouTubeId('https://soundcloud.com/artist/track')).toBeNull();
    expect(extractYouTubeId('some song name')).toBeNull();
  });
});

describe('parseSpotifyUrl', () => {
  it('recognises tracks, albums, playlists and artists', () => {
    expect(parseSpotifyUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toEqual({
      type: 'track',
      id: '4cOdK2wGLETKBW3PvgPWqT',
    });
    expect(parseSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')?.type).toBe(
      'playlist',
    );
    expect(parseSpotifyUrl('spotify:album:1DFixLWuPkv3KT3TnV35m3')).toEqual({
      type: 'album',
      id: '1DFixLWuPkv3KT3TnV35m3',
    });
  });

  it('handles localised links', () => {
    expect(
      parseSpotifyUrl('https://open.spotify.com/intl-tr/track/4cOdK2wGLETKBW3PvgPWqT')?.id,
    ).toBe('4cOdK2wGLETKBW3PvgPWqT');
  });

  it('returns null for anything else', () => {
    expect(parseSpotifyUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { extractYouTubeId } from './resolver.js';
import { parseSpotifyUrl } from './spotify.js';

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

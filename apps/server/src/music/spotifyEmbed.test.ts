import { describe, expect, it } from 'vitest';
import { ExternalServiceError } from '../core/errors.js';
import { EMBED_TRACK_LIMIT, entityToResolution, readEntityFromPayload } from './spotifyEmbed.js';

function payload(entity: unknown): unknown {
  return { props: { pageProps: { state: { data: { entity } } } } };
}

function trackEntry(index: number) {
  return {
    uri: `spotify:track:id${index}`,
    title: `Track ${index}`,
    subtitle: 'Some Artist',
    duration: 210_000,
  };
}

describe('readEntityFromPayload', () => {
  it('reads the entity out of the page data', () => {
    const entity = readEntityFromPayload(payload({ type: 'playlist', name: 'Mix' }));
    expect(entity.name).toBe('Mix');
  });

  it('rejects a page that no longer contains an entity', () => {
    expect(() => readEntityFromPayload({ props: {} })).toThrow(ExternalServiceError);
  });
});

describe('entityToResolution', () => {
  it('maps a playlist into playable metadata', () => {
    const result = entityToResolution(
      {
        type: 'playlist',
        name: 'Road trip',
        trackList: [trackEntry(1), trackEntry(2)],
        coverArt: {
          sources: [
            { url: 'https://img/small.jpg', width: 64 },
            { url: 'https://img/large.jpg', width: 640 },
          ],
        },
      },
      'playlist',
      'abc',
      500,
    );

    expect(result.name).toBe('Road trip');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      title: 'Track 1',
      artist: 'Some Artist',
      url: 'https://open.spotify.com/track/id1',
      durationSeconds: 210,
      // The largest cover is reused for every entry; the embed has no per track art.
      thumbnail: 'https://img/large.jpg',
    });
    expect(result.limited).toBe(false);
  });

  it('flags a playlist that hit the public page limit', () => {
    const entries = Array.from({ length: EMBED_TRACK_LIMIT }, (_, index) => trackEntry(index));
    const result = entityToResolution(
      { type: 'playlist', name: 'Long', trackList: entries },
      'playlist',
      'abc',
      500,
    );

    expect(result.items).toHaveLength(EMBED_TRACK_LIMIT);
    expect(result.limited).toBe(true);
  });

  it('respects the requested import limit', () => {
    const entries = Array.from({ length: 40 }, (_, index) => trackEntry(index));
    const result = entityToResolution(
      { type: 'album', name: 'Album', trackList: entries },
      'album',
      'abc',
      10,
    );

    expect(result.items).toHaveLength(10);
    expect(result.limited).toBe(false);
  });

  it('maps a single track, joining every artist', () => {
    const result = entityToResolution(
      {
        type: 'track',
        name: 'Solo',
        uri: 'spotify:track:xyz',
        duration: 185_000,
        artists: [{ name: 'First' }, { name: 'Second' }],
      },
      'track',
      'xyz',
      500,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.artist).toBe('First, Second');
    expect(result.items[0]?.url).toBe('https://open.spotify.com/track/xyz');
    expect(result.name).toBeNull();
  });

  it('skips entries without a title and fails when nothing is left', () => {
    expect(() =>
      entityToResolution(
        { type: 'playlist', name: 'Empty', trackList: [{ uri: 'spotify:track:1' }] },
        'playlist',
        'abc',
        500,
      ),
    ).toThrow(ExternalServiceError);
  });
});

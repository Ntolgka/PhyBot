import { z } from 'zod';
import { ExternalServiceError } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import type { SpotifyItem, SpotifyResolution, SpotifyResourceType } from './spotify.js';

const log = createLogger('spotify:embed');

/**
 * Reader for Spotify's public embed page.
 *
 * Spotify's Web API no longer returns playlist contents to applications that
 * authenticate with client credentials (it answers 403 even for public,
 * user-made playlists), so links would otherwise be unplayable. The embed page
 * that powers the "share" iframe is public, needs no authentication and lists
 * the tracks, which is enough to search each song afterwards.
 *
 * This is an undocumented page, so all of the scraping is isolated here behind
 * `readSpotifyEmbed()` and can be replaced without touching the music engine.
 */
const EMBED_BASE = 'https://open.spotify.com/embed';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';
const NEXT_DATA_PATTERN = /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s;

/** The embed page lists at most this many tracks for a playlist. */
export const EMBED_TRACK_LIMIT = 100;

const coverArtSchema = z
  .object({
    sources: z.array(z.object({ url: z.string(), width: z.number().nullish() })).optional(),
  })
  .partial();

const trackListEntrySchema = z
  .object({
    uri: z.string().optional(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    duration: z.number().optional(),
  })
  .partial();

const entitySchema = z
  .object({
    type: z.string().optional(),
    name: z.string().optional(),
    title: z.string().optional(),
    uri: z.string().optional(),
    subtitle: z.string().optional(),
    duration: z.number().optional(),
    artists: z.array(z.object({ name: z.string().optional() }).partial()).optional(),
    coverArt: coverArtSchema.optional(),
    visualIdentity: z
      .object({ image: z.array(z.object({ url: z.string() }).partial()).optional() })
      .partial()
      .optional(),
    trackList: z.array(trackListEntrySchema).optional(),
  })
  .partial();

type Entity = z.infer<typeof entitySchema>;

function pickCover(entity: Entity): string | null {
  const sources = entity.coverArt?.sources ?? [];
  const widest = [...sources].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  if (widest?.url) return widest.url;
  return entity.visualIdentity?.image?.[0]?.url ?? null;
}

/** "spotify:track:ID" is the only form the embed uses for track references. */
function trackUrlFromUri(uri: string | undefined): string {
  const id = uri?.split(':').pop();
  return id ? `https://open.spotify.com/track/${id}` : '';
}

async function fetchEntity(type: SpotifyResourceType, id: string): Promise<Entity> {
  let response: Response;
  try {
    response = await fetch(`${EMBED_BASE}/${type}/${id}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new ExternalServiceError(
      'Spotify',
      `Could not reach Spotify (${(error as Error).message})`,
    );
  }

  if (response.status === 404) {
    throw new ExternalServiceError('Spotify', 'That Spotify link does not exist or is private');
  }
  if (!response.ok) {
    throw new ExternalServiceError(
      'Spotify',
      `The public Spotify page returned ${response.status}`,
    );
  }

  const html = await response.text();
  const match = NEXT_DATA_PATTERN.exec(html);
  if (!match?.[1]) {
    throw new ExternalServiceError('Spotify', 'The public Spotify page could not be read');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    throw new ExternalServiceError('Spotify', 'The public Spotify page returned unreadable data');
  }
  return readEntityFromPayload(payload);
}

/** Extracts the embed entity from a raw `__NEXT_DATA__` payload. */
export function readEntityFromPayload(payload: unknown): Entity {
  const entity = (
    payload as { props?: { pageProps?: { state?: { data?: { entity?: unknown } } } } }
  )?.props?.pageProps?.state?.data?.entity;
  const parsed = entitySchema.safeParse(entity);
  if (!parsed.success) {
    throw new ExternalServiceError('Spotify', 'The public Spotify page changed format');
  }
  return parsed.data;
}

/** Turns an embed entity into playable metadata. Pure, so it can be tested. */
export function entityToResolution(
  entity: Entity,
  type: SpotifyResourceType,
  id: string,
  limit: number,
): SpotifyResolution {
  const cover = pickCover(entity);

  if (type === 'track') {
    const title = entity.name ?? entity.title;
    if (!title) throw new ExternalServiceError('Spotify', 'That track could not be read');
    const artist =
      entity.artists
        ?.map((item) => item.name)
        .filter((name): name is string => Boolean(name))
        .join(', ') ??
      entity.subtitle ??
      '';
    return {
      name: null,
      items: [
        {
          title,
          artist,
          url: trackUrlFromUri(entity.uri) || `https://open.spotify.com/track/${id}`,
          durationSeconds: Math.round((entity.duration ?? 0) / 1000),
          thumbnail: cover,
        },
      ],
      limited: false,
    };
  }

  const entries = entity.trackList ?? [];
  const items: SpotifyItem[] = entries
    .filter((entry) => Boolean(entry.title))
    .slice(0, limit)
    .map((entry) => ({
      title: entry.title ?? '',
      artist: entry.subtitle ?? '',
      url: trackUrlFromUri(entry.uri),
      durationSeconds: Math.round((entry.duration ?? 0) / 1000),
      thumbnail: cover,
    }));

  if (items.length === 0) {
    throw new ExternalServiceError('Spotify', 'That Spotify link contains no playable tracks');
  }

  // The embed stops at 100 entries, so a longer playlist is knowingly partial.
  const limited = entries.length >= EMBED_TRACK_LIMIT && items.length >= EMBED_TRACK_LIMIT;
  if (limited) {
    log.info({ type, id }, `Imported the first ${items.length} tracks from a Spotify ${type}`);
  }

  return { name: entity.name ?? entity.title ?? null, items, limited };
}

/** Reads a Spotify link through the public embed page. */
export async function readSpotifyEmbed(
  type: SpotifyResourceType,
  id: string,
  limit: number,
): Promise<SpotifyResolution> {
  const entity = await fetchEntity(type, id);
  return entityToResolution(entity, type, id, limit);
}

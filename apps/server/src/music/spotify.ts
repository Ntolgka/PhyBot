import { config } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { ExternalServiceError } from '../core/errors.js';
import { getUserAccessToken, isSpotifyLinked, reportAuthorizationRejected } from './spotifyAuth.js';
import { readSpotifyEmbed } from './spotifyEmbed.js';

const log = createLogger('spotify');

/**
 * Spotify does not expose playable audio, so it is only used for metadata:
 * every track is later matched against YouTube.
 *
 * Two sources are used. The Web API gives the richest data but only answers
 * for tracks and albums when an application authenticates with client
 * credentials; playlists and artist top tracks return 403 regardless of who
 * owns them. Anything the API refuses falls back to the public embed page,
 * which needs no credentials at all.
 */
export interface SpotifyItem {
  title: string;
  artist: string;
  url: string;
  durationSeconds: number;
  thumbnail: string | null;
}

export interface SpotifyResolution {
  name: string | null;
  items: SpotifyItem[];
  /** True when the source could only return part of the collection. */
  limited: boolean;
}

export type SpotifyResourceType = 'track' | 'album' | 'playlist' | 'artist';

interface TokenState {
  value: string;
  expiresAt: number;
}

let token: TokenState | null = null;

export function hasSpotifyCredentials(): boolean {
  return Boolean(config.music.spotifyClientId && config.music.spotifyClientSecret);
}

export function parseSpotifyUrl(input: string): { type: SpotifyResourceType; id: string } | null {
  const match =
    /(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?|spotify:)(track|album|playlist|artist)[/:]([A-Za-z0-9]+)/.exec(
      input,
    );
  if (!match) return null;
  const [, type, id] = match;
  if (!type || !id) return null;
  return { type: type as SpotifyResourceType, id };
}

async function getToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 30_000) return token.value;
  const credentials = Buffer.from(
    `${config.music.spotifyClientId}:${config.music.spotifyClientSecret}`,
  ).toString('base64');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    token = null;
    throw new ExternalServiceError(
      'Spotify',
      `Authentication failed (${response.status}). Check SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.`,
    );
  }
  const payload = (await response.json()) as { access_token: string; expires_in: number };
  token = {
    value: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
  return token.value;
}

/** Error carrying Spotify's HTTP status so callers can decide to fall back. */
class SpotifyApiError extends ExternalServiceError {
  readonly upstreamStatus: number;

  constructor(upstreamStatus: number, message: string) {
    super('Spotify', message);
    this.upstreamStatus = upstreamStatus;
  }
}

/**
 * Prefers the linked account, because Spotify only serves playlist contents to
 * a user authorised token; falls back to the application token for the
 * endpoints that still accept it.
 */
async function api<T>(path: string): Promise<T> {
  const userToken = await getUserAccessToken();
  const accessToken = userToken ?? (await getToken());

  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 429) {
    throw new SpotifyApiError(429, 'Rate limited, try again in a moment');
  }
  if (!response.ok) {
    if (userToken && (response.status === 401 || response.status === 403)) {
      reportAuthorizationRejected();
    }
    throw new SpotifyApiError(response.status, `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

interface ApiTrack {
  name: string;
  duration_ms: number;
  external_urls?: { spotify?: string };
  artists?: { name: string }[];
  album?: { images?: { url: string }[] };
  is_local?: boolean;
}

function toItem(track: ApiTrack, fallbackImage: string | null = null): SpotifyItem {
  return {
    title: track.name,
    artist: track.artists?.map((artist) => artist.name).join(', ') ?? '',
    url: track.external_urls?.spotify ?? '',
    durationSeconds: Math.round((track.duration_ms ?? 0) / 1000),
    thumbnail: track.album?.images?.[0]?.url ?? fallbackImage,
  };
}

/** Endpoints Spotify still answers for client credential applications. */
async function resolveWithApi(
  type: SpotifyResourceType,
  id: string,
  limit: number,
): Promise<SpotifyResolution> {
  if (type === 'track') {
    const track = await api<ApiTrack>(`/tracks/${id}`);
    return { name: null, items: [toItem(track)], limited: false };
  }

  if (type === 'album') {
    const album = await api<{
      name: string;
      images?: { url: string }[];
      tracks: { items: ApiTrack[] };
    }>(`/albums/${id}?limit=50`);
    const cover = album.images?.[0]?.url ?? null;
    const items = album.tracks.items.slice(0, limit).map((track) => toItem(track, cover));
    if (items.length === 0) throw new SpotifyApiError(404, 'That album has no playable tracks');
    return { name: album.name, items, limited: false };
  }

  if (type === 'artist') {
    const result = await api<{ tracks: ApiTrack[] }>(`/artists/${id}/top-tracks?market=TR`);
    const items = result.tracks.slice(0, limit).map((track) => toItem(track));
    if (items.length === 0) throw new SpotifyApiError(404, 'That artist has no tracks');
    return { name: result.tracks[0]?.artists?.[0]?.name ?? null, items, limited: false };
  }

  const playlist = await api<{ name: string }>(`/playlists/${id}?fields=name`);
  const items: SpotifyItem[] = [];
  let offset = 0;
  while (items.length < limit) {
    // Spotify renamed this collection from "tracks" to "items", and each entry
    // now carries the song under `item`; the old names are still accepted here
    // so an older account or a rollback keeps working.
    const page = await api<{
      items: { item?: ApiTrack | null; track?: ApiTrack | null }[];
      next: string | null;
    }>(`/playlists/${id}/items?limit=100&offset=${offset}`);

    for (const entry of page.items) {
      const track = entry.item ?? entry.track;
      if (!track || track.is_local) continue;
      items.push(toItem(track));
      if (items.length >= limit) break;
    }
    if (!page.next) break;
    offset += 100;
  }
  if (items.length === 0) throw new SpotifyApiError(404, 'That playlist has no playable tracks');
  return { name: playlist.name, items, limited: false };
}

/** Reads a track/album/playlist/artist link into a flat list of songs. */
export async function resolveSpotify(url: string, limit: number): Promise<SpotifyResolution> {
  const parsed = parseSpotifyUrl(url);
  if (!parsed) throw new ExternalServiceError('Spotify', 'Unrecognised Spotify link');

  if (hasSpotifyCredentials() || isSpotifyLinked()) {
    try {
      return await resolveWithApi(parsed.type, parsed.id, limit);
    } catch (error) {
      // 401/403/404 mean this application may not read the resource, which is
      // the normal answer for playlists; the public page still can.
      const status = error instanceof SpotifyApiError ? error.upstreamStatus : 0;
      if (status === 429) throw error;
      log.debug(
        { type: parsed.type, status },
        'Spotify Web API refused the request, using the public page instead',
      );
    }
  }

  return readSpotifyEmbed(parsed.type, parsed.id, limit);
}

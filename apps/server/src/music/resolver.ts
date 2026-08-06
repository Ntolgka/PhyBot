import { randomUUID } from 'node:crypto';
import type { ResolvedRequest, SearchResult, Track, TrackSource } from '@phybot/shared';
import { MAX_PLAYLIST_IMPORT } from '@phybot/shared';
import { AppError } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import { fetchMetadata, fetchPlaylist, searchEntries, type YtDlpEntry } from './ytdlp.js';
import { parseSpotifyUrl, resolveSpotify } from './spotify.js';

const log = createLogger('resolver');

export interface ResolveOptions {
  requestedBy: string;
  requestedByName: string;
  /** Maximum number of tracks to import from a playlist. */
  limit?: number;
}

/**
 * Extra search results fetched so that discarding channels and playlists still
 * leaves something to play. Costs nothing: a flat search returns them all in
 * one call.
 */
const SEARCH_OVERFETCH = 5;

const YOUTUBE_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
];
const SOUNDCLOUD_HOSTS = [
  'soundcloud.com',
  'www.soundcloud.com',
  'm.soundcloud.com',
  'on.soundcloud.com',
];

function parseUrl(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function sourceFromEntry(entry: YtDlpEntry, url: string): TrackSource {
  const extractor = (entry.extractor_key ?? entry.ie_key ?? entry.extractor ?? '').toLowerCase();
  if (extractor.includes('youtube')) return 'youtube';
  if (extractor.includes('soundcloud')) return 'soundcloud';
  const parsed = parseUrl(url);
  if (parsed) {
    if (YOUTUBE_HOSTS.includes(parsed.hostname)) return 'youtube';
    if (SOUNDCLOUD_HOSTS.includes(parsed.hostname)) return 'soundcloud';
  }
  return 'radio';
}

function pickThumbnail(entry: YtDlpEntry, source: TrackSource): string | null {
  if (entry.thumbnail) return entry.thumbnail;
  const thumbnails = entry.thumbnails ?? [];
  const best = thumbnails
    .filter((item): item is { url: string; width?: number } => Boolean(item.url))
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  if (best) return best.url;
  if (source === 'youtube' && entry.id) return `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`;
  return null;
}

/**
 * A search does not only return videos. Searching an artist name puts their
 * channel first, and yt-dlp reports it with the same title as a song, so it
 * used to be queued as if it were one. Playing it then made yt-dlp try to
 * enumerate the whole channel until the timeout, once per attempt.
 *
 * Channels and playlists come back tagged as a tab or a playlist and carry no
 * duration, which is what separates them from a real track.
 */
export function isPlayableEntry(entry: YtDlpEntry): boolean {
  const extractor = (entry.extractor_key ?? entry.ie_key ?? entry.extractor ?? '').toLowerCase();
  if (extractor.includes('tab') || extractor.includes('playlist')) return false;
  if (entry._type === 'playlist') return false;

  const url = entry.webpage_url ?? entry.original_url ?? entry.url ?? '';
  if (/youtube\.com\/(channel|c|user|@|playlist)/i.test(url)) return false;
  if (/soundcloud\.com\/[^/]+\/(sets|tracks|likes)(\/|$)/i.test(url)) return false;

  return true;
}

function entryToTrack(entry: YtDlpEntry, options: ResolveOptions): Track | null {
  const url = entry.webpage_url ?? entry.original_url ?? entry.url;
  if (!url) return null;
  if (!isPlayableEntry(entry)) return null;
  const source = sourceFromEntry(entry, url);
  const title = entry.track ?? entry.title ?? entry.fulltitle ?? 'Unknown title';
  // Private or deleted playlist items still appear in flat listings.
  if (title === '[Private video]' || title === '[Deleted video]') return null;

  return {
    id: randomUUID(),
    title,
    author: entry.artist ?? entry.uploader ?? entry.channel ?? '',
    url,
    duration: Math.max(0, Math.round(entry.duration ?? 0)),
    isLive: entry.is_live === true || entry.live_status === 'is_live',
    thumbnail: pickThumbnail(entry, source),
    source,
    requestedBy: options.requestedBy,
    requestedByName: options.requestedByName,
    addedAt: Date.now(),
  };
}

function emptyResult(): ResolvedRequest {
  return { playlistName: null, playlistUrl: null, tracks: [], truncated: 0 };
}

/**
 * Turns anything a user can type (link, playlist, search text) into tracks.
 * Spotify entries carry a search query instead of a playable link and are
 * matched against YouTube when they reach the front of the queue.
 */
export async function resolveQuery(
  query: string,
  options: ResolveOptions,
): Promise<ResolvedRequest> {
  const trimmed = query.trim();
  if (!trimmed) throw new AppError('empty_query', 'Enter a song name or a link');

  const limit = Math.min(options.limit ?? MAX_PLAYLIST_IMPORT, MAX_PLAYLIST_IMPORT);

  if (parseSpotifyUrl(trimmed)) {
    return resolveSpotifyRequest(trimmed, options, limit);
  }

  const url = parseUrl(trimmed);
  if (url) return resolveLink(url, options, limit);

  // Plain text: "sc:" switches the search to SoundCloud.
  const soundcloudSearch = /^sc:\s*/i.test(trimmed);
  const searchText = trimmed.replace(/^sc:\s*/i, '');
  // Asking for several and taking the first playable one, because the top hit
  // for an artist name is usually their channel rather than a song.
  const entries = await searchEntries(
    searchText,
    SEARCH_OVERFETCH,
    soundcloudSearch ? 'scsearch' : 'ytsearch',
  );
  if (entries.length === 0) {
    throw new AppError('no_results', `No results for "${searchText}"`, 404);
  }
  const track = entries.map((entry) => entryToTrack(entry, options)).find(Boolean);
  if (!track) throw new AppError('no_results', `No playable result for "${searchText}"`, 404);
  return { ...emptyResult(), tracks: [track] };
}

async function resolveSpotifyRequest(
  link: string,
  options: ResolveOptions,
  limit: number,
): Promise<ResolvedRequest> {
  const resolution = await resolveSpotify(link, limit);
  const tracks: Track[] = resolution.items
    .filter((item) => item.title)
    .map((item) => ({
      id: randomUUID(),
      title: item.title,
      author: item.artist,
      url: item.url || link,
      duration: item.durationSeconds,
      isLive: false,
      thumbnail: item.thumbnail,
      source: 'spotify' as const,
      requestedBy: options.requestedBy,
      requestedByName: options.requestedByName,
      addedAt: Date.now(),
      searchQuery: `${item.artist} ${item.title}`.trim(),
    }));

  if (tracks.length === 0) {
    throw new AppError('no_results', 'That Spotify link contains no playable tracks', 404);
  }
  return {
    playlistName: resolution.name,
    playlistUrl: resolution.name ? link : null,
    tracks,
    truncated: 0,
    partial: resolution.limited,
  };
}

async function resolveLink(
  url: URL,
  options: ResolveOptions,
  limit: number,
): Promise<ResolvedRequest> {
  const listId = url.searchParams.get('list');
  // A watch link carrying an auto generated mix (list=RD...) is still a single
  // video request; only real playlists are expanded.
  const isMix = listId?.startsWith('RD') === true && url.searchParams.has('v');
  const isYouTubePlaylist =
    YOUTUBE_HOSTS.includes(url.hostname) &&
    !isMix &&
    (listId !== null || url.pathname.startsWith('/playlist'));
  const isSoundcloudSet =
    SOUNDCLOUD_HOSTS.includes(url.hostname) && url.pathname.includes('/sets/');

  if (isYouTubePlaylist || isSoundcloudSet) {
    const payload = await fetchPlaylist(url.toString(), limit);
    const entries = payload.entries ?? [];
    const tracks = entries
      .map((entry) => entryToTrack(entry, options))
      .filter((track): track is Track => track !== null);
    if (tracks.length === 0) {
      throw new AppError('no_results', 'That playlist has no playable tracks', 404);
    }
    const total = payload.playlist_count ?? entries.length;
    return {
      playlistName: payload.title ?? payload.playlist_title ?? 'Playlist',
      playlistUrl: url.toString(),
      tracks,
      truncated: Math.max(0, total - tracks.length),
    };
  }

  const payload = await fetchMetadata(url.toString());
  if (payload._type === 'playlist' && payload.entries?.length) {
    const tracks = payload.entries
      .slice(0, limit)
      .map((entry) => entryToTrack(entry, options))
      .filter((track): track is Track => track !== null);
    if (tracks.length > 0) {
      return {
        playlistName: payload.title ?? 'Playlist',
        playlistUrl: url.toString(),
        tracks,
        truncated: Math.max(0, payload.entries.length - tracks.length),
      };
    }
  }

  const track = entryToTrack(
    { ...payload, webpage_url: payload.webpage_url ?? url.toString() },
    options,
  );
  if (!track) throw new AppError('no_results', 'That link has no playable audio', 404);
  return { ...emptyResult(), tracks: [track] };
}

/** Search used by the dashboard and the /search command. */
export async function searchTracks(query: string, limit = 8): Promise<SearchResult[]> {
  const soundcloud = /^sc:\s*/i.test(query);
  const text = query.replace(/^sc:\s*/i, '').trim();
  if (!text) return [];
  // Over-fetch so dropping channels does not leave the list short.
  const entries = await searchEntries(
    text,
    limit + SEARCH_OVERFETCH,
    soundcloud ? 'scsearch' : 'ytsearch',
  );
  return entries
    .filter(isPlayableEntry)
    .slice(0, limit)
    .map((entry) => {
      const url = entry.webpage_url ?? entry.url;
      if (!url) return null;
      const source = sourceFromEntry(entry, url);
      return {
        title: entry.title ?? 'Unknown title',
        author: entry.uploader ?? entry.channel ?? '',
        url,
        duration: Math.max(0, Math.round(entry.duration ?? 0)),
        thumbnail: pickThumbnail(entry, source),
        source,
        isLive: entry.is_live === true || entry.live_status === 'is_live',
      } satisfies SearchResult;
    })
    .filter((item): item is SearchResult => item !== null);
}

/**
 * Finds a playable YouTube match for a track that has no direct stream
 * (currently only Spotify entries).
 */
export async function resolvePlayableUrl(track: Track): Promise<string> {
  if (track.source !== 'spotify') return track.url;
  const query = track.searchQuery ?? `${track.author} ${track.title}`.trim();
  const entries = await searchEntries(query, SEARCH_OVERFETCH, 'ytsearch');
  const playable = entries.find(isPlayableEntry);
  const match = playable?.webpage_url ?? playable?.url;
  if (!match) {
    log.warn({ query }, 'No YouTube match for Spotify track');
    throw new AppError('no_match', `Could not find a playable version of "${track.title}"`, 404);
  }
  return match;
}

/**
 * Picks a related track for autoplay using the YouTube mix of the seed track.
 * Returns null when nothing suitable is found; autoplay is best effort.
 */
export async function findRelatedTrack(
  seed: Track,
  playedUrls: Set<string>,
  options: ResolveOptions,
): Promise<Track | null> {
  try {
    const videoId = extractYouTubeId(seed.url);
    if (!videoId) {
      const results = await searchTracks(`${seed.author} ${seed.title} mix`, 5);
      const candidate = results.find((item) => !playedUrls.has(item.url));
      return candidate ? searchResultToTrack(candidate, options) : null;
    }
    const mix = await fetchPlaylist(
      `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`,
      25,
    );
    const entries = mix.entries ?? [];
    for (const entry of entries) {
      const track = entryToTrack(entry, options);
      if (track && !playedUrls.has(track.url)) return track;
    }
    return null;
  } catch (error) {
    log.warn({ err: error }, 'Autoplay lookup failed');
    return null;
  }
}

function searchResultToTrack(result: SearchResult, options: ResolveOptions): Track {
  return {
    id: randomUUID(),
    title: result.title,
    author: result.author,
    url: result.url,
    duration: result.duration,
    isLive: result.isLive,
    thumbnail: result.thumbnail,
    source: result.source,
    requestedBy: options.requestedBy,
    requestedByName: options.requestedByName,
    addedAt: Date.now(),
  };
}

export function extractYouTubeId(url: string): string | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  if (parsed.hostname === 'youtu.be') return parsed.pathname.slice(1) || null;
  if (!YOUTUBE_HOSTS.includes(parsed.hostname)) return null;
  const id = parsed.searchParams.get('v');
  if (id) return id;
  const shortsMatch = /^\/(?:shorts|embed|live)\/([\w-]+)/.exec(parsed.pathname);
  return shortsMatch?.[1] ?? null;
}

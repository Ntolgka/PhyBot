import type { Track } from '@phybot/shared';
import { createLogger } from '../core/logger.js';

const log = createLogger('lyrics');

/**
 * LRCLIB is a free, open lyrics database with no key and no rate limit worth
 * worrying about. It is the only external service here that returns *timed*
 * lyrics, which is what makes the dashboard able to follow along.
 */
const BASE_URL = 'https://lrclib.net/api';
const REQUEST_TIMEOUT_MS = 10_000;
/** Lyrics never change, so a hit is worth keeping for the whole session. */
const CACHE_LIMIT = 200;

export interface LyricLine {
  /** Seconds from the start of the track. */
  at: number;
  text: string;
}

export interface Lyrics {
  artist: string;
  title: string;
  /** Empty when only unsynced lyrics were found. */
  lines: LyricLine[];
  plain: string;
  synced: boolean;
  source: string;
}

interface LrclibEntry {
  id?: number;
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

/** Words uploaders decorate a title with, which no lyrics database knows about. */
const NOISE_WORDS =
  'official|resmi|video|audio|lyric|lyrics|klip|klibi|hd|4k|remaster\\w*|visualizer|live|canlı|akustik|acoustic|cover|bass ?boosted|slowed|reverb|speed ?up|edit|remix|prod\\.?|beat|tiktok|dance|special|mv';

/**
 * Only bracketed groups and trailing pipe segments count as noise.
 *
 * An earlier version also let a dash open one, which quietly ate the song:
 * "Seçkin Türk - Sigara (Akustik 2023)" collapsed to "Seçkin Türk" and matched
 * a different track entirely. A dash separates the artist from the title far
 * more often than it introduces junk.
 */
const BRACKET_NOISE = new RegExp(`\\s*[([][^)\\]]*\\b(?:${NOISE_WORDS})\\b[^)\\]]*[)\\]]?`, 'gi');
const TRAILING_NOISE = new RegExp(`\\s*\\|[^|]*\\b(?:${NOISE_WORDS})\\b[^|]*$`, 'i');

/**
 * Turns a track into something a lyrics database can match.
 *
 * Uploaders write "Cansever - Kime Bu İnat(Offical Video)" and set the channel
 * as the artist ("Ateş Müzik"), which finds nothing. Splitting the "artist -
 * title" form out of the title and dropping the promotional noise is what turns
 * a miss into an exact hit.
 */
export function trackSearchTerms(track: Pick<Track, 'title' | 'author'>): {
  artist: string;
  title: string;
} {
  let title = track.title.replace(BRACKET_NOISE, ' ').replace(TRAILING_NOISE, ' ');
  let artist = track.author;

  // "Artist - Song": the title's own artist beats the channel name.
  const split = /^\s*(.{2,60}?)\s+[-–—]\s+(.{2,})$/.exec(title);
  if (split?.[1] && split[2]) {
    artist = split[1];
    title = split[2];
  }

  const tidy = (value: string): string =>
    value
      .replace(/\s*\bfeat\.?\b.*$/i, '')
      .replace(/[_"'“”]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-–—|,]+|[\s\-–—|,]+$/g, '')
      .trim();

  return { artist: tidy(artist), title: tidy(title) };
}

/**
 * Parses an LRC document into timed lines.
 *
 * A line may carry several timestamps when the same words repeat, and the file
 * starts with metadata tags such as `[ar:]` that are not lyrics at all.
 */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (stamps.length === 0) continue;

    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const stamp of stamps) {
      const minutes = Number(stamp[1]);
      const seconds = Number(stamp[2]);
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) continue;
      // Two digits mean hundredths, three mean milliseconds.
      const fraction = stamp[3] ? Number(stamp[3]) / (stamp[3].length === 3 ? 1000 : 100) : 0;
      lines.push({ at: minutes * 60 + seconds + fraction, text });
    }
  }
  return lines.sort((a, b) => a.at - b.at);
}

/**
 * Picks the best of several candidates.
 *
 * Searching "Neşet Ertaş Yalan Dünya" returns a rapper's remix first, so
 * matching the track length is what keeps the original ahead of covers and
 * sped-up edits. Timed lyrics always beat untimed ones.
 */
export function pickBestMatch(entries: LrclibEntry[], duration: number): LrclibEntry | null {
  const usable = entries.filter((entry) => entry.syncedLyrics || entry.plainLyrics);
  if (usable.length === 0) return null;

  const score = (entry: LrclibEntry): number => {
    let value = entry.syncedLyrics ? 1000 : 0;
    if (duration > 0 && entry.duration) {
      const drift = Math.abs(entry.duration - duration);
      // Within a couple of seconds is the same recording; past half a minute it
      // is a different one wearing the same name.
      value += drift <= 2 ? 500 : drift <= 10 ? 250 : drift <= 30 ? 50 : -Math.min(drift, 300);
    }
    return value;
  };

  return [...usable].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** The line that should be highlighted at a given playback position. */
export function lineAt(lines: LyricLine[], position: number): number {
  let index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if ((lines[i]?.at ?? 0) <= position) index = i;
    else break;
  }
  return index;
}

const cache = new Map<string, Lyrics | null>();

async function request<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}/${path}`, {
      headers: { 'User-Agent': 'PhyBot (https://github.com/)', Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (error) {
    log.debug({ err: error, path }, 'Lyrics request failed');
    return null;
  }
}

function toLyrics(entry: LrclibEntry): Lyrics | null {
  const synced = entry.syncedLyrics?.trim() ?? '';
  const plain = entry.plainLyrics?.trim() ?? '';
  if (!synced && !plain) return null;

  const lines = synced ? parseLrc(synced) : [];
  return {
    artist: entry.artistName ?? '',
    title: entry.trackName ?? '',
    lines,
    plain: plain || lines.map((line) => line.text).join('\n'),
    synced: lines.length > 0,
    source: 'LRCLIB',
  };
}

/**
 * Finds lyrics for a track: an exact lookup on the cleaned metadata first,
 * then a search when that misses, which is the usual case for anything but a
 * cleanly tagged upload.
 */
export async function findLyrics(
  track: Pick<Track, 'title' | 'author' | 'duration'>,
): Promise<Lyrics | null> {
  const { artist, title } = trackSearchTerms(track);
  if (!title) return null;

  const key = `${artist}|${title}|${Math.round(track.duration)}`.toLowerCase();
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const params = new URLSearchParams({ artist_name: artist, track_name: title });
  if (track.duration > 0) params.set('duration', String(Math.round(track.duration)));

  let found: Lyrics | null = null;
  const exact = await request<LrclibEntry>(`get?${params.toString()}`);
  if (exact?.syncedLyrics || exact?.plainLyrics) found = toLyrics(exact);

  if (!found) {
    const results = await request<LrclibEntry[]>(
      `search?q=${encodeURIComponent(`${artist} ${title}`.trim())}`,
    );
    const best = Array.isArray(results) ? pickBestMatch(results, track.duration) : null;
    if (best) found = toLyrics(best);
  }

  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, found);
  return found;
}

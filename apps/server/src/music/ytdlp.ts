import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { ExternalServiceError } from '../core/errors.js';

const log = createLogger('yt-dlp');
const require = createRequire(import.meta.url);

/**
 * yt-dlp is the only reliable way to resolve playable audio streams for
 * YouTube and SoundCloud. Everything that shells out to it lives in this file
 * so the rest of the music engine stays independent of the tool.
 */
function resolveBinary(): string {
  if (process.env.YT_DLP_PATH && existsSync(process.env.YT_DLP_PATH)) {
    return process.env.YT_DLP_PATH;
  }
  const packageEntry = require.resolve('youtube-dl-exec');
  const binary = join(
    dirname(packageEntry),
    '..',
    'bin',
    process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp',
  );
  return binary;
}

export const ytDlpPath = resolveBinary();

export function isYtDlpAvailable(): boolean {
  return existsSync(ytDlpPath);
}

/** Caps concurrent yt-dlp processes so a large playlist cannot exhaust the CPU. */
class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.waiting.shift()?.();
    };
  }
}

const semaphore = new Semaphore(3);

// --no-call-home used to be here. It was deprecated in 2026 and now prints a
// three line notice on every single call, which then masked real errors.
const BASE_ARGS = [
  '--no-color',
  '--no-progress',
  '--ignore-config',
  '--no-warnings',
  '--socket-timeout',
  '15',
];

function withGlobalArgs(args: string[]): string[] {
  const result = [...BASE_ARGS, ...args];
  if (config.music.cookiesFile) {
    result.unshift('--cookies', config.music.cookiesFile);
  }
  return result;
}

/** Lines yt-dlp prints that describe its own configuration, not the failure. */
function isNoise(line: string): boolean {
  return /^(WARNING|Deprecated Feature|Please remove them|See\s+https?:)/i.test(line.trim());
}

/**
 * Explains why a call failed.
 *
 * yt-dlp writes deprecation notices and warnings to stderr on runs that
 * otherwise succeed, and taking the last lines meant a timeout was once
 * reported as "Please remove them from your command/configuration" - which
 * describes neither the cause nor anything the user can act on. Real errors are
 * preferred, and a kill by the timeout is named as such.
 */
function describeFailure(
  error: Error & { killed?: boolean; code?: number | string; signal?: string },
  stderr: string,
  timeoutMs: number,
): string {
  const lines = stderr.split('\n').filter((line) => line.trim() && !isNoise(line));
  const reported = lines.filter((line) => /^ERROR:/i.test(line.trim()));
  const detail = (reported.length > 0 ? reported : lines).slice(-2).join(' ').trim();

  // execFile reports a timeout as a kill, with nothing useful in stderr.
  if (error.killed) {
    const seconds = Math.max(1, Math.round(timeoutMs / 1000));
    return detail ? `Timed out after ${seconds}s: ${detail}` : `Timed out after ${seconds}s`;
  }
  return detail || error.message || 'Command failed';
}

export async function runYtDlp(args: string[], timeoutMs = 45_000): Promise<string> {
  if (!isYtDlpAvailable()) {
    throw new ExternalServiceError(
      'yt-dlp',
      'The yt-dlp binary is missing. Run "npm install" again to download it.',
    );
  }
  const release = await semaphore.acquire();
  try {
    return await new Promise<string>((resolve, reject) => {
      execFile(
        ytDlpPath,
        withGlobalArgs(args),
        { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            reject(new ExternalServiceError('yt-dlp', describeFailure(error, stderr, timeoutMs)));
            return;
          }
          resolve(stdout);
        },
      );
    });
  } finally {
    release();
  }
}

/** Raw yt-dlp metadata fields the music engine relies on. */
export interface YtDlpEntry {
  id?: string;
  ie_key?: string;
  extractor_key?: string;
  extractor?: string;
  title?: string;
  fulltitle?: string;
  track?: string;
  artist?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: { url?: string; preference?: number; width?: number }[];
  webpage_url?: string;
  original_url?: string;
  url?: string;
  is_live?: boolean;
  live_status?: string;
  availability?: string;
  http_headers?: Record<string, string>;
  entries?: YtDlpEntry[];
  _type?: string;
  playlist_title?: string;
  playlist_count?: number;
}

function parseJson(raw: string, context: string): YtDlpEntry {
  const trimmed = raw.trim();
  if (!trimmed) throw new ExternalServiceError('yt-dlp', `Empty response while ${context}`);
  try {
    return JSON.parse(trimmed) as YtDlpEntry;
  } catch {
    // A playlist dump can emit one JSON document per line.
    const firstLine = trimmed.split('\n')[0] ?? '';
    try {
      return JSON.parse(firstLine) as YtDlpEntry;
    } catch {
      throw new ExternalServiceError('yt-dlp', `Unreadable response while ${context}`);
    }
  }
}

/** Metadata for a single track, without resolving the media URL. */
export async function fetchMetadata(url: string): Promise<YtDlpEntry> {
  const stdout = await runYtDlp([
    url,
    '--dump-single-json',
    '--skip-download',
    '--no-playlist',
    '--flat-playlist',
  ]);
  return parseJson(stdout, 'reading track information');
}

/** Flat playlist listing; entries only carry ids, titles and durations. */
export async function fetchPlaylist(url: string, limit: number): Promise<YtDlpEntry> {
  const stdout = await runYtDlp(
    [
      url,
      '--dump-single-json',
      '--skip-download',
      '--flat-playlist',
      '--yes-playlist',
      '--playlist-end',
      String(Math.max(1, limit)),
    ],
    120_000,
  );
  return parseJson(stdout, 'reading the playlist');
}

/** Runs a provider search (ytsearch / scsearch) and returns flat entries. */
export async function searchEntries(
  query: string,
  limit: number,
  provider: 'ytsearch' | 'scsearch' = 'ytsearch',
): Promise<YtDlpEntry[]> {
  const stdout = await runYtDlp([
    `${provider}${Math.max(1, limit)}:${query}`,
    '--dump-single-json',
    '--skip-download',
    '--flat-playlist',
  ]);
  const parsed = parseJson(stdout, 'searching');
  return parsed.entries ?? (parsed.id ? [parsed] : []);
}

export interface PlaybackInfo {
  streamUrl: string;
  headers: Record<string, string>;
  duration: number;
  isLive: boolean;
  title: string;
  webpageUrl: string;
}

interface CacheEntry {
  value: PlaybackInfo;
  expiresAt: number;
}

/**
 * Direct media URLs are signed and short lived, so they are cached only long
 * enough to cover retries and seeking within one track.
 */
const playbackCache = new Map<string, CacheEntry>();
const PLAYBACK_TTL_MS = 20 * 60 * 1000;

export function invalidatePlayback(url: string): void {
  playbackCache.delete(url);
}

export async function fetchPlaybackInfo(url: string): Promise<PlaybackInfo> {
  const cached = playbackCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const stdout = await runYtDlp([
    url,
    '--no-playlist',
    '--skip-download',
    '--dump-json',
    '-f',
    'bestaudio[acodec=opus]/bestaudio/best',
  ]);
  const entry = parseJson(stdout, 'resolving the audio stream');
  if (!entry.url) {
    throw new ExternalServiceError('yt-dlp', 'No playable audio stream was returned');
  }

  const info: PlaybackInfo = {
    streamUrl: entry.url,
    headers: entry.http_headers ?? {},
    duration: Math.max(0, Math.round(entry.duration ?? 0)),
    isLive: entry.is_live === true || entry.live_status === 'is_live',
    title: entry.title ?? entry.fulltitle ?? 'Unknown title',
    webpageUrl: entry.webpage_url ?? url,
  };

  playbackCache.set(url, { value: info, expiresAt: Date.now() + PLAYBACK_TTL_MS });
  if (playbackCache.size > 200) {
    // Cheap eviction: drop the oldest inserted key.
    const oldest = playbackCache.keys().next();
    if (!oldest.done) playbackCache.delete(oldest.value);
  }
  return info;
}

export async function ytDlpVersion(): Promise<string | null> {
  try {
    const stdout = await runYtDlp(['--version'], 10_000);
    return stdout.trim();
  } catch (error) {
    log.warn({ err: error }, 'Could not read the yt-dlp version');
    return null;
  }
}

import { ExternalServiceError } from '../../core/errors.js';
import { createLogger } from '../../core/logger.js';

const log = createLogger('turksigara');

/**
 * The punycode host is what resolves; the readable form is turksigara.net.
 * Requests go to the encoded name so no DNS lookup depends on the runtime
 * normalising the Turkish dotless i.
 */
const PUNYCODE_HOST = 'xn--trksigara-q9a.net';
const BASE_URL = `https://${PUNYCODE_HOST}`;
const REQUEST_TIMEOUT_MS = 15_000;
/** Comfortably inside Discord's upload limit for a bot without Nitro. */
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
/**
 * The archive changes only when a post is added, so the index list is reused
 * rather than re-downloading 75 KB of HTML for every command.
 */
const INDEX_TTL_MS = 6 * 60 * 60 * 1000;

export interface TurksigaraPost {
  index: number;
  /** Absolute URL of the full size image. */
  imageUrl: string;
  /** The page the image belongs to, used as the embed link. */
  pageUrl: string;
  /** Caption the site gives the picture, from its own description. */
  title: string;
}

async function fetchText(path: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${path}`, {
      headers: { 'User-Agent': 'PhyBot', Accept: 'text/html' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ExternalServiceError(
      'turksigara',
      error instanceof Error && error.name === 'TimeoutError'
        ? 'Site zaman asimina ugradi'
        : 'Siteye ulasilamadi',
    );
  }
  if (!res.ok) {
    throw new ExternalServiceError('turksigara', `Site ${res.status} dondurdu`);
  }
  return res.text();
}

/**
 * Reads the post numbers out of the archive page.
 *
 * The site's own random button picks a number up to a hard coded total, which
 * goes stale as posts are added. Reading the archive instead means the command
 * follows the site without needing a release, and can never land on a number
 * that has no post.
 */
export function parseArchiveIndexes(html: string): number[] {
  const found = new Set<number>();
  for (const match of html.matchAll(/alt="#(\d+)"/g)) {
    const index = Number(match[1]);
    if (Number.isInteger(index) && index > 0) found.add(index);
  }
  // Older archive markup numbered only the links.
  if (found.size === 0) {
    for (const match of html.matchAll(/href="(\d+)"/g)) {
      const index = Number(match[1]);
      if (Number.isInteger(index) && index > 0) found.add(index);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Points a URL at the punycode host.
 *
 * The site's own tags say `turksigara.net`, which 301s to `türksigara.net`
 * spelled with a raw Unicode character in the Location header. Ordinary clients
 * follow that; Discord's image proxy does not, which is why an embed built from
 * the tag as written showed no picture at all. The encoded host answers 200
 * directly with no redirect.
 */
export function toPunycodeHost(url: string): string {
  return url.replace(
    /^(https?:\/\/)(?:www\.)?(?:turksigara\.net|türksigara\.net|xn--trksigara-q9a\.net)/i,
    `$1${PUNYCODE_HOST}`,
  );
}

/**
 * Pulls the picture out of a post page.
 *
 * The Open Graph tags carry an absolute, percent-encoded URL, which the plain
 * `<img src>` does not - those are relative and contain raw Turkish characters
 * that Discord will not fetch.
 */
export function parsePost(html: string, index: number): TurksigaraPost | null {
  const image = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
  if (!image) return null;

  const description = /<meta property="og:description" content="([^"]*)"/.exec(html)?.[1] ?? '';
  const absolute = image.startsWith('http') ? image : `${BASE_URL}/${image.replace(/^\//, '')}`;
  return {
    index,
    imageUrl: toPunycodeHost(absolute),
    pageUrl: `${BASE_URL}/${index}`,
    title: description.trim() || `#${index}`,
  };
}

export interface TurksigaraImage {
  data: Buffer;
  /** Plain ASCII, because `attachment://` cannot reference a Turkish filename. */
  fileName: string;
}

/**
 * Downloads the picture so it can be attached to the message rather than
 * linked. Uploading the bytes means the embed does not depend on Discord being
 * able to reach the site when someone scrolls past the message later.
 */
export async function fetchImage(post: TurksigaraPost): Promise<TurksigaraImage | null> {
  let res: Response;
  try {
    res = await fetch(post.imageUrl, {
      headers: { 'User-Agent': 'PhyBot', Accept: 'image/*' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const size = Number(res.headers.get('content-length') ?? 0);
  if (size > MAX_ATTACHMENT_BYTES) {
    log.debug({ index: post.index, size }, 'Picture is too large to attach, linking instead');
    return null;
  }

  const data = Buffer.from(await res.arrayBuffer());
  if (data.length === 0 || data.length > MAX_ATTACHMENT_BYTES) return null;

  const extension = /\.(png|jpe?g|gif|webp)(?:$|\?)/i.exec(post.imageUrl)?.[1]?.toLowerCase();
  return { data, fileName: `turksigara-${post.index}.${extension ?? 'png'}` };
}

let cachedIndexes: { values: number[]; expiresAt: number } | null = null;

async function loadIndexes(): Promise<number[]> {
  if (cachedIndexes && cachedIndexes.expiresAt > Date.now()) return cachedIndexes.values;

  const values = parseArchiveIndexes(await fetchText('arsiv'));
  if (values.length === 0) {
    throw new ExternalServiceError('turksigara', 'Arsivde hic gonderi bulunamadi');
  }
  cachedIndexes = { values, expiresAt: Date.now() + INDEX_TTL_MS };
  log.debug({ count: values.length }, 'Loaded the archive index');
  return values;
}

/**
 * Fetches one specific post. The number is the one in the site's own address,
 * so `/turksigara 142` and turksigara.net/142 are the same picture.
 */
export async function postByIndex(index: number): Promise<TurksigaraPost> {
  if (!Number.isInteger(index) || index <= 0) {
    throw new ExternalServiceError('turksigara', 'Gonderi numarasi 1 veya daha buyuk olmali');
  }

  let html: string;
  try {
    html = await fetchText(String(index));
  } catch (error) {
    // A number past the end of the archive answers 404. That is the user asking
    // for something that does not exist, not the site being unreachable, so it
    // is worth saying which numbers do work.
    if (!(error instanceof ExternalServiceError) || !error.message.includes('404')) throw error;
    const highest = (await loadIndexes()).at(-1);
    throw new ExternalServiceError(
      'turksigara',
      highest === undefined
        ? `#${index} diye bir gonderi yok`
        : `#${index} diye bir gonderi yok, en buyuk numara #${highest}`,
    );
  }

  const post = parsePost(html, index);
  if (!post) throw new ExternalServiceError('turksigara', `#${index} icin gorsel bulunamadi`);
  return post;
}

/** Fetches one post at random, the way the site's own "rastgele" button does. */
export async function randomPost(): Promise<TurksigaraPost> {
  const indexes = await loadIndexes();

  // A post can be pulled while its thumbnail is still listed, so a couple of
  // other numbers are tried before giving up on the whole command.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const index = indexes[Math.floor(Math.random() * indexes.length)];
    if (index === undefined) break;
    const post = parsePost(await fetchText(String(index)), index);
    if (post) return post;
    log.debug({ index }, 'Post had no image, trying another');
  }
  throw new ExternalServiceError('turksigara', 'Rastgele gonderi alinamadi');
}

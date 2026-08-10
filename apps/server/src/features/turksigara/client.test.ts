import { describe, expect, it } from 'vitest';
import { parseArchiveIndexes, parsePost, postByIndex, toPunycodeHost } from './client.js';

describe('toPunycodeHost', () => {
  it('rewrites the host the site advertises', () => {
    // turksigara.net 301s to a raw Unicode host, which Discord will not follow,
    // so the embed came out with no picture.
    expect(toPunycodeHost('https://turksigara.net/00209-a.png')).toBe(
      'https://xn--trksigara-q9a.net/00209-a.png',
    );
  });

  it('handles the Unicode and www spellings too', () => {
    expect(toPunycodeHost('https://türksigara.net/x.jpg')).toBe(
      'https://xn--trksigara-q9a.net/x.jpg',
    );
    expect(toPunycodeHost('https://www.turksigara.net/x.jpg')).toBe(
      'https://xn--trksigara-q9a.net/x.jpg',
    );
  });

  it('leaves an already encoded host alone', () => {
    const url = 'https://xn--trksigara-q9a.net/x.jpg';
    expect(toPunycodeHost(url)).toBe(url);
  });

  it('does not touch an unrelated host', () => {
    expect(toPunycodeHost('https://example.com/turksigara.net.jpg')).toBe(
      'https://example.com/turksigara.net.jpg',
    );
  });

  it('keeps percent-encoding intact', () => {
    expect(toPunycodeHost('https://turksigara.net/00163-gta-t%C3%BCrksigaracity.jpg')).toBe(
      'https://xn--trksigara-q9a.net/00163-gta-t%C3%BCrksigaracity.jpg',
    );
  });
});

describe('parseArchiveIndexes', () => {
  it('reads the post numbers out of the thumbnail alt text', () => {
    const html = `
      <img src="thumbs/00001-a.webp" alt="#1" loading="lazy" />
      <img src="thumbs/00002-b.webp" alt="#2" loading="lazy" />
      <img src="thumbs/00251-c.webp" alt="#251" loading="lazy" />
    `;
    expect(parseArchiveIndexes(html)).toEqual([1, 2, 251]);
  });

  it('falls back to numbered links when there is no alt text', () => {
    expect(parseArchiveIndexes('<a href="7">x</a><a href="3">y</a><a href="arsiv">z</a>')).toEqual([
      3, 7,
    ]);
  });

  it('returns nothing for a page with no posts', () => {
    expect(parseArchiveIndexes('<html><body>bos</body></html>')).toEqual([]);
  });

  it('does not repeat a number listed twice', () => {
    expect(parseArchiveIndexes('<img alt="#5" /><img alt="#5" />')).toEqual([5]);
  });
});

describe('parsePost', () => {
  const html = `
    <meta property="og:description" content="gta türksigaracity" />
    <meta property="og:image" content="https://turksigara.net/00163-gta-t%C3%BCrksigaracity.jpg" />
    <img src="00163-gta-türksigaracity.jpg">
  `;

  it('takes the absolute percent-encoded URL from the Open Graph tag', () => {
    // The plain img src is relative and has raw Turkish characters, which
    // Discord will not fetch; the host is normalised on the way through.
    const post = parsePost(html, 163);
    expect(post?.imageUrl).toBe('https://xn--trksigara-q9a.net/00163-gta-t%C3%BCrksigaracity.jpg');
    expect(post?.pageUrl).toBe('https://xn--trksigara-q9a.net/163');
    expect(post?.title).toBe('gta türksigaracity');
  });

  it('makes a relative Open Graph image absolute', () => {
    const post = parsePost('<meta property="og:image" content="/00001-a.jpg" />', 1);
    expect(post?.imageUrl).toBe('https://xn--trksigara-q9a.net/00001-a.jpg');
  });

  it('falls back to the number when the page carries no description', () => {
    const post = parsePost('<meta property="og:image" content="https://x/y.jpg" />', 9);
    expect(post?.title).toBe('#9');
  });

  it('returns null when the page has no image at all', () => {
    expect(parsePost('<html><body>404</body></html>', 1)).toBeNull();
  });
});

describe('postByIndex', () => {
  // Rejected before any request, so a mistyped number never reaches the site.
  it.each([0, -3, 1.5, Number.NaN])('refuses %s without asking the site', async (value) => {
    await expect(postByIndex(value)).rejects.toThrow(/1 veya daha buyuk/);
  });
});

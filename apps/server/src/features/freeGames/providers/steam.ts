import { z } from 'zod';
import type { FreeGameOffer } from '@phybot/shared';
import { truncate } from '@phybot/shared';
import { createLogger } from '../../../core/logger.js';
import { fetchJson } from '../http.js';
import { normalizeTitle } from '../normalize.js';

const log = createLogger('freegames:steam');

const FEATURED_CATEGORIES_ENDPOINT =
  'https://store.steampowered.com/api/featuredcategories?cc=tr&l=turkish';
const GAMERPOWER_ENDPOINT = 'https://www.gamerpower.com/api/giveaways?platform=steam&type=game';

const specialItemSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    name: z.string(),
    discounted: z.boolean().optional(),
    discount_percent: z.number().optional(),
    original_price: z.number().optional(),
    final_price: z.number().optional(),
    large_capsule_image: z.string().optional(),
    header_image: z.string().optional(),
  })
  .passthrough();

const featuredCategoriesSchema = z
  .object({
    specials: z
      .object({ items: z.array(z.unknown()).optional() })
      .partial()
      .optional(),
  })
  .passthrough();

function formatCents(cents: number): string {
  return `${(cents / 100).toFixed(2)} TL`;
}

/**
 * Extracts items from the Steam "specials" bucket that are currently
 * discounted to 0 (a temporary store-wide free promotion), never regular
 * free-to-play titles (which never appear discounted here).
 */
export function parseFeaturedCategories(raw: unknown, now = Date.now()): FreeGameOffer[] {
  const parsed = featuredCategoriesSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn(
      { issues: parsed.error.issues.slice(0, 3) },
      'Unexpected Steam featuredcategories response shape',
    );
    return [];
  }

  const items = parsed.data.specials?.items ?? [];
  const offers: FreeGameOffer[] = [];

  for (const raw of items) {
    const result = specialItemSchema.safeParse(raw);
    if (!result.success) continue;
    const item = result.data;

    if (!item.discounted) continue;
    if ((item.discount_percent ?? 0) < 100) continue;
    if ((item.final_price ?? 0) !== 0) continue;

    offers.push({
      id: `steam:${item.id}`,
      store: 'steam',
      title: item.name,
      description: '',
      url: `https://store.steampowered.com/app/${item.id}/`,
      imageUrl: item.large_capsule_image ?? item.header_image ?? null,
      originalPrice:
        typeof item.original_price === 'number' ? formatCents(item.original_price) : '',
      startsAt: null,
      // The endpoint gives no end date for these promotions.
      endsAt: null,
      keepForever: false,
      fetchedAt: now,
    });
  }

  return offers;
}

const gamerPowerItemSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    title: z.string(),
    worth: z.string().optional(),
    thumbnail: z.string().optional(),
    image: z.string().optional(),
    description: z.string().optional(),
    open_giveaway_url: z.string().optional(),
    gamerpower_url: z.string().optional(),
    end_date: z.string().optional(),
    platforms: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();

/** Parses GamerPower's giveaways list, keeping only Steam game giveaways. */
export function parseGamerPowerGiveaways(raw: unknown, now = Date.now()): FreeGameOffer[] {
  if (!Array.isArray(raw)) {
    log.warn('Unexpected GamerPower response shape');
    return [];
  }

  const offers: FreeGameOffer[] = [];
  for (const entry of raw) {
    const result = gamerPowerItemSchema.safeParse(entry);
    if (!result.success) continue;
    const item = result.data;

    if (item.type && item.type.toLowerCase() !== 'game') continue;
    if (item.platforms && !item.platforms.toLowerCase().includes('steam')) continue;

    const url = item.open_giveaway_url ?? item.gamerpower_url;
    if (!url) continue;

    const endsAt =
      item.end_date && item.end_date !== 'N/A' && !Number.isNaN(Date.parse(item.end_date))
        ? Date.parse(item.end_date)
        : null;

    offers.push({
      id: `steam:gp-${item.id}`,
      store: 'steam',
      title: item.title,
      description: truncate(item.description ?? '', 300),
      url,
      imageUrl: item.image ?? item.thumbnail ?? null,
      originalPrice: item.worth && item.worth !== 'N/A' ? item.worth : '',
      startsAt: null,
      endsAt,
      keepForever: false,
      fetchedAt: now,
    });
  }

  return offers;
}

/**
 * Combines the two Steam sources, dropping GamerPower giveaways that
 * duplicate a title already found in the featured-categories specials.
 */
export function mergeSteamOffers(
  specials: FreeGameOffer[],
  giveaways: FreeGameOffer[],
): FreeGameOffer[] {
  const seenIds = new Set(specials.map((offer) => offer.id));
  const seenTitles = new Set(specials.map((offer) => normalizeTitle(offer.title)));
  const merged = [...specials];

  for (const offer of giveaways) {
    if (seenIds.has(offer.id)) continue;
    const key = normalizeTitle(offer.title);
    if (seenTitles.has(key)) continue;
    merged.push(offer);
    seenIds.add(offer.id);
    seenTitles.add(key);
  }

  return merged;
}

export async function fetchSteamFreeGames(): Promise<FreeGameOffer[]> {
  const [featured, giveaways] = await Promise.allSettled([
    fetchJson(FEATURED_CATEGORIES_ENDPOINT, 'Steam'),
    fetchJson(GAMERPOWER_ENDPOINT, 'GamerPower'),
  ]);

  if (featured.status === 'rejected' && giveaways.status === 'rejected') {
    throw featured.reason;
  }

  let specials: FreeGameOffer[] = [];
  if (featured.status === 'fulfilled') {
    specials = parseFeaturedCategories(featured.value);
  } else {
    log.warn({ err: featured.reason }, 'Steam featuredcategories fetch failed');
  }

  let giveawayOffers: FreeGameOffer[] = [];
  if (giveaways.status === 'fulfilled') {
    giveawayOffers = parseGamerPowerGiveaways(giveaways.value);
  } else {
    log.warn({ err: giveaways.reason }, 'GamerPower fetch failed');
  }

  return mergeSteamOffers(specials, giveawayOffers);
}

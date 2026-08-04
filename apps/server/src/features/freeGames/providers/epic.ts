import { z } from 'zod';
import type { FreeGameOffer } from '@phybot/shared';
import { truncate } from '@phybot/shared';
import { createLogger } from '../../../core/logger.js';
import { fetchJson } from '../http.js';

const log = createLogger('freegames:epic');

const EPIC_ENDPOINT =
  'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=tr&country=TR&allowCountries=TR';

const keyImageSchema = z
  .object({ type: z.string().optional(), url: z.string().optional() })
  .partial();

const promotionalOfferSchema = z
  .object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    discountSetting: z.object({ discountPercentage: z.number().optional() }).partial().optional(),
  })
  .partial();

const promotionalOfferGroupSchema = z
  .object({ promotionalOffers: z.array(promotionalOfferSchema).optional() })
  .partial();

const pageMappingSchema = z
  .object({ pageSlug: z.string().optional(), pageType: z.string().optional() })
  .partial();

const elementSchema = z
  .object({
    id: z.string(),
    namespace: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    productSlug: z.string().nullable().optional(),
    urlSlug: z.string().optional(),
    keyImages: z.array(keyImageSchema).optional(),
    catalogNs: z
      .object({ mappings: z.array(pageMappingSchema).optional() })
      .partial()
      .optional(),
    offerMappings: z.array(pageMappingSchema).optional(),
    price: z
      .object({
        totalPrice: z
          .object({
            discountPrice: z.number().optional(),
            fmtPrice: z.object({ originalPrice: z.string().optional() }).partial().optional(),
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),
    promotions: z
      .object({ promotionalOffers: z.array(promotionalOfferGroupSchema).optional() })
      .partial()
      .nullable()
      .optional(),
  })
  .passthrough();

const responseSchema = z
  .object({
    data: z
      .object({
        Catalog: z
          .object({
            searchStore: z
              .object({ elements: z.array(z.unknown()).optional() })
              .partial()
              .optional(),
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),
  })
  .partial();

type EpicElement = z.infer<typeof elementSchema>;

const IMAGE_PRIORITY = ['OfferImageWide', 'Thumbnail', 'DieselStoreFrontWide', 'OfferImageTall'];

function pickImage(images: EpicElement['keyImages']): string | null {
  if (!images || images.length === 0) return null;
  for (const type of IMAGE_PRIORITY) {
    const match = images.find((image) => image.type === type && image.url);
    if (match?.url) return match.url;
  }
  return images.find((image) => image.url)?.url ?? null;
}

function resolveSlug(element: EpicElement): string | null {
  if (element.productSlug && element.productSlug !== '[]') return element.productSlug;
  const homeMapping = element.catalogNs?.mappings?.find(
    (mapping) => mapping.pageType === 'productHome' && mapping.pageSlug,
  );
  if (homeMapping?.pageSlug) return homeMapping.pageSlug;
  const offerMapping = element.offerMappings?.find((mapping) => mapping.pageSlug);
  if (offerMapping?.pageSlug) return offerMapping.pageSlug;
  if (element.urlSlug) return element.urlSlug;
  return null;
}

/** Finds an active promotional window that discounts the offer to 0, if any. */
function activeFreePromotion(
  element: EpicElement,
  now: number,
): { startsAt: number; endsAt: number } | null {
  const groups = element.promotions?.promotionalOffers ?? [];
  for (const group of groups) {
    for (const offer of group.promotionalOffers ?? []) {
      if (!offer.startDate || !offer.endDate) continue;
      const startsAt = Date.parse(offer.startDate);
      const endsAt = Date.parse(offer.endDate);
      if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) continue;
      if (now < startsAt || now > endsAt) continue;
      if (offer.discountSetting?.discountPercentage === 0) return { startsAt, endsAt };
    }
  }
  return null;
}

/**
 * Turns the raw Epic Games "freeGamesPromotions" payload into offers,
 * keeping only elements whose current promotion discounts the price to 0
 * right now. Malformed elements are skipped, never thrown.
 */
export function parseEpicCatalog(raw: unknown, now = Date.now()): FreeGameOffer[] {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn({ issues: parsed.error.issues.slice(0, 3) }, 'Unexpected Epic Games response shape');
    return [];
  }

  const elements = parsed.data.data?.Catalog?.searchStore?.elements ?? [];
  const offers: FreeGameOffer[] = [];

  for (const raw of elements) {
    const result = elementSchema.safeParse(raw);
    if (!result.success) continue;
    const element = result.data;

    const promotion = activeFreePromotion(element, now);
    if (!promotion) continue;

    const slug = resolveSlug(element);
    if (!slug) {
      log.warn(
        { id: element.id, title: element.title },
        'Could not resolve a store slug, skipping offer',
      );
      continue;
    }

    offers.push({
      id: `epic:${element.namespace ?? 'ns'}:${element.id}`,
      store: 'epic',
      title: element.title,
      description: truncate(element.description ?? '', 300),
      url: `https://store.epicgames.com/tr/p/${slug}`,
      imageUrl: pickImage(element.keyImages),
      originalPrice: element.price?.totalPrice?.fmtPrice?.originalPrice ?? '',
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      // Epic grants permanent ownership once claimed during the promo window.
      keepForever: true,
      fetchedAt: now,
    });
  }

  return offers;
}

export async function fetchEpicFreeGames(): Promise<FreeGameOffer[]> {
  const json = await fetchJson(EPIC_ENDPOINT, 'Epic Games');
  return parseEpicCatalog(json);
}

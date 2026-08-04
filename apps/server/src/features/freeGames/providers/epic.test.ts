import { describe, expect, it } from 'vitest';
import { parseEpicCatalog } from './epic.js';

const NOW = Date.parse('2026-08-04T12:00:00.000Z');
const HOUR = 3_600_000;

function withActivePromo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offer-1',
    namespace: 'ns-1',
    title: 'Free Game',
    description: 'A great free game',
    productSlug: 'free-game',
    keyImages: [
      { type: 'Thumbnail', url: 'https://example.com/thumb.jpg' },
      { type: 'OfferImageWide', url: 'https://example.com/wide.jpg' },
    ],
    price: { totalPrice: { discountPrice: 0, fmtPrice: { originalPrice: '$19.99' } } },
    promotions: {
      promotionalOffers: [
        {
          promotionalOffers: [
            {
              startDate: new Date(NOW - HOUR).toISOString(),
              endDate: new Date(NOW + HOUR).toISOString(),
              discountSetting: { discountPercentage: 0 },
            },
          ],
        },
      ],
    },
    ...overrides,
  };
}

function catalogWith(elements: unknown[]) {
  return { data: { Catalog: { searchStore: { elements } } } };
}

describe('parseEpicCatalog', () => {
  it('keeps an element whose promotion is currently active and free', () => {
    const offers = parseEpicCatalog(catalogWith([withActivePromo()]), NOW);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      id: 'epic:ns-1:offer-1',
      store: 'epic',
      title: 'Free Game',
      url: 'https://store.epicgames.com/tr/p/free-game',
      imageUrl: 'https://example.com/wide.jpg',
      keepForever: true,
    });
  });

  it('drops an element whose promotion has not started yet', () => {
    const element = withActivePromo({
      promotions: {
        promotionalOffers: [
          {
            promotionalOffers: [
              {
                startDate: new Date(NOW + HOUR).toISOString(),
                endDate: new Date(NOW + 2 * HOUR).toISOString(),
                discountSetting: { discountPercentage: 0 },
              },
            ],
          },
        ],
      },
    });
    expect(parseEpicCatalog(catalogWith([element]), NOW)).toHaveLength(0);
  });

  it('drops an element whose promotion has already ended', () => {
    const element = withActivePromo({
      promotions: {
        promotionalOffers: [
          {
            promotionalOffers: [
              {
                startDate: new Date(NOW - 2 * HOUR).toISOString(),
                endDate: new Date(NOW - HOUR).toISOString(),
                discountSetting: { discountPercentage: 0 },
              },
            ],
          },
        ],
      },
    });
    expect(parseEpicCatalog(catalogWith([element]), NOW)).toHaveLength(0);
  });

  it('drops an element that is only partially discounted', () => {
    const element = withActivePromo({
      promotions: {
        promotionalOffers: [
          {
            promotionalOffers: [
              {
                startDate: new Date(NOW - HOUR).toISOString(),
                endDate: new Date(NOW + HOUR).toISOString(),
                discountSetting: { discountPercentage: 50 },
              },
            ],
          },
        ],
      },
    });
    expect(parseEpicCatalog(catalogWith([element]), NOW)).toHaveLength(0);
  });

  it('drops an element with no promotions at all', () => {
    const element = withActivePromo({ promotions: {} });
    expect(parseEpicCatalog(catalogWith([element]), NOW)).toHaveLength(0);
  });

  it('falls back to catalogNs.mappings when productSlug is missing', () => {
    const element = withActivePromo({
      productSlug: null,
      catalogNs: { mappings: [{ pageSlug: 'fallback-slug', pageType: 'productHome' }] },
    });
    const offers = parseEpicCatalog(catalogWith([element]), NOW);
    expect(offers[0]?.url).toBe('https://store.epicgames.com/tr/p/fallback-slug');
  });

  it('falls back to offerMappings when catalogNs has no productHome mapping', () => {
    const element = withActivePromo({
      productSlug: '[]',
      catalogNs: { mappings: [] },
      offerMappings: [{ pageSlug: 'offer-slug' }],
    });
    const offers = parseEpicCatalog(catalogWith([element]), NOW);
    expect(offers[0]?.url).toBe('https://store.epicgames.com/tr/p/offer-slug');
  });

  it('skips an element with no resolvable slug at all', () => {
    const element = withActivePromo({ productSlug: null, catalogNs: {}, offerMappings: [] });
    expect(parseEpicCatalog(catalogWith([element]), NOW)).toHaveLength(0);
  });

  it('tolerates malformed elements without throwing', () => {
    const offers = parseEpicCatalog(catalogWith([{ not: 'a valid element' }, 42, null]), NOW);
    expect(offers).toEqual([]);
  });

  it('tolerates a completely unexpected response shape', () => {
    expect(parseEpicCatalog({ unexpected: true }, NOW)).toEqual([]);
    expect(parseEpicCatalog(null, NOW)).toEqual([]);
    expect(parseEpicCatalog('not json', NOW)).toEqual([]);
  });
});

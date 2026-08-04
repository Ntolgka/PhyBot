import { describe, expect, it } from 'vitest';
import type { FreeGameOffer } from '@phybot/shared';
import { mergeSteamOffers, parseFeaturedCategories, parseGamerPowerGiveaways } from './steam.js';

const NOW = Date.parse('2026-08-04T12:00:00.000Z');

describe('parseFeaturedCategories', () => {
  it('keeps a fully discounted item marked as discounted', () => {
    const raw = {
      specials: {
        items: [
          {
            id: 123,
            name: 'Free Weekend Game',
            discounted: true,
            discount_percent: 100,
            original_price: 1999,
            final_price: 0,
            header_image: 'https://example.com/header.jpg',
          },
        ],
      },
    };
    const offers = parseFeaturedCategories(raw, NOW);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      id: 'steam:123',
      store: 'steam',
      title: 'Free Weekend Game',
      url: 'https://store.steampowered.com/app/123/',
      originalPrice: '19.99 TL',
      keepForever: false,
    });
  });

  it('drops items that are not discounted at all', () => {
    const raw = { specials: { items: [{ id: 1, name: 'Regular Game', discounted: false }] } };
    expect(parseFeaturedCategories(raw, NOW)).toHaveLength(0);
  });

  it('drops items with a partial discount', () => {
    const raw = {
      specials: {
        items: [
          { id: 1, name: 'Half Off', discounted: true, discount_percent: 50, final_price: 999 },
        ],
      },
    };
    expect(parseFeaturedCategories(raw, NOW)).toHaveLength(0);
  });

  it('drops items whose final price is not actually zero', () => {
    const raw = {
      specials: {
        items: [
          { id: 1, name: 'Odd Data', discounted: true, discount_percent: 100, final_price: 100 },
        ],
      },
    };
    expect(parseFeaturedCategories(raw, NOW)).toHaveLength(0);
  });

  it('tolerates a missing specials bucket', () => {
    expect(parseFeaturedCategories({}, NOW)).toEqual([]);
  });

  it('tolerates a completely unexpected shape', () => {
    expect(parseFeaturedCategories(null, NOW)).toEqual([]);
    expect(parseFeaturedCategories('not json', NOW)).toEqual([]);
  });
});

describe('parseGamerPowerGiveaways', () => {
  it('parses a well formed steam game giveaway', () => {
    const raw = [
      {
        id: 456,
        title: 'Cool Game (Steam)',
        worth: '$9.99',
        open_giveaway_url: 'https://gamerpower.com/g/456',
        end_date: '2026-09-01 00:00:00',
        platforms: 'Steam, PC',
        type: 'Game',
      },
    ];
    const offers = parseGamerPowerGiveaways(raw, NOW);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      id: 'steam:gp-456',
      store: 'steam',
      title: 'Cool Game (Steam)',
      url: 'https://gamerpower.com/g/456',
      originalPrice: '$9.99',
      keepForever: false,
    });
    expect(offers[0]?.endsAt).toBe(Date.parse('2026-09-01 00:00:00'));
  });

  it('treats an "N/A" end date as unknown rather than throwing', () => {
    const raw = [
      {
        id: 1,
        title: 'Ongoing',
        open_giveaway_url: 'https://x.com/1',
        end_date: 'N/A',
        type: 'Game',
      },
    ];
    const offers = parseGamerPowerGiveaways(raw, NOW);
    expect(offers[0]?.endsAt).toBeNull();
  });

  it('drops non-game giveaways', () => {
    const raw = [{ id: 1, title: 'DLC pack', open_giveaway_url: 'https://x.com/1', type: 'DLC' }];
    expect(parseGamerPowerGiveaways(raw, NOW)).toHaveLength(0);
  });

  it('drops entries whose platforms do not include steam', () => {
    const raw = [
      {
        id: 1,
        title: 'Epic exclusive',
        open_giveaway_url: 'https://x.com/1',
        platforms: 'Epic Games Store',
      },
    ];
    expect(parseGamerPowerGiveaways(raw, NOW)).toHaveLength(0);
  });

  it('drops entries with no usable url', () => {
    const raw = [{ id: 1, title: 'No link' }];
    expect(parseGamerPowerGiveaways(raw, NOW)).toHaveLength(0);
  });

  it('tolerates a non-array payload', () => {
    expect(parseGamerPowerGiveaways({ not: 'an array' }, NOW)).toEqual([]);
  });
});

describe('mergeSteamOffers', () => {
  function offer(overrides: Partial<FreeGameOffer>): FreeGameOffer {
    return {
      id: 'steam:1',
      store: 'steam',
      title: 'Game',
      description: '',
      url: 'https://example.com',
      imageUrl: null,
      originalPrice: '',
      startsAt: null,
      endsAt: null,
      keepForever: false,
      fetchedAt: NOW,
      ...overrides,
    };
  }

  it('keeps both lists when there is no overlap', () => {
    const specials = [offer({ id: 'steam:1', title: 'Game One' })];
    const giveaways = [offer({ id: 'steam:gp-2', title: 'Game Two' })];
    expect(mergeSteamOffers(specials, giveaways)).toHaveLength(2);
  });

  it('drops a giveaway whose title matches a special by normalized name', () => {
    const specials = [offer({ id: 'steam:1', title: 'Restaurant Empire' })];
    const giveaways = [offer({ id: 'steam:gp-2', title: 'Restaurant Empire (Steam)' })];
    const merged = mergeSteamOffers(specials, giveaways);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('steam:1');
  });

  it('drops an exact id collision', () => {
    const specials = [offer({ id: 'steam:1', title: 'Game One' })];
    const giveaways = [offer({ id: 'steam:1', title: 'Game One Duplicate' })];
    expect(mergeSteamOffers(specials, giveaways)).toHaveLength(1);
  });
});

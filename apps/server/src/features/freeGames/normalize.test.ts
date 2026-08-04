import { describe, expect, it } from 'vitest';
import type { FreeGameOffer } from '@phybot/shared';
import { dedupeOffers, normalizeTitle } from './normalize.js';

function offer(overrides: Partial<FreeGameOffer> = {}): FreeGameOffer {
  return {
    id: 'steam:1',
    store: 'steam',
    title: 'Test Game',
    description: '',
    url: 'https://example.com',
    imageUrl: null,
    originalPrice: '',
    startsAt: null,
    endsAt: null,
    keepForever: false,
    fetchedAt: 1000,
    ...overrides,
  };
}

describe('dedupeOffers', () => {
  it('keeps a single copy per id', () => {
    const offers = [offer({ id: 'a' }), offer({ id: 'b' }), offer({ id: 'a' })];
    expect(dedupeOffers(offers)).toHaveLength(2);
  });

  it('keeps the most recently fetched copy when ids collide', () => {
    const older = offer({ id: 'a', title: 'Old title', fetchedAt: 1000 });
    const newer = offer({ id: 'a', title: 'New title', fetchedAt: 2000 });
    const result = dedupeOffers([older, newer]);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('New title');
  });

  it('returns an empty array for an empty input', () => {
    expect(dedupeOffers([])).toEqual([]);
  });
});

describe('normalizeTitle', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeTitle('The Game: Deluxe Edition!')).toBe('the game deluxe edition');
  });

  it('strips a trailing (Steam) suffix', () => {
    expect(normalizeTitle('Restaurant Empire (Steam)')).toBe('restaurant empire');
  });

  it('produces matching keys for equivalent titles', () => {
    expect(normalizeTitle('Cool Game (Steam)')).toBe(normalizeTitle('Cool Game'));
  });
});

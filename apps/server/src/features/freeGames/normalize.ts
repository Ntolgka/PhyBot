import type { FreeGameOffer } from '@phybot/shared';

/** Deduplicates offers by id, keeping the most recently fetched copy of each. */
export function dedupeOffers(offers: readonly FreeGameOffer[]): FreeGameOffer[] {
  const byId = new Map<string, FreeGameOffer>();
  for (const offer of offers) {
    const existing = byId.get(offer.id);
    if (!existing || offer.fetchedAt >= existing.fetchedAt) {
      byId.set(offer.id, offer);
    }
  }
  return [...byId.values()];
}

/** Normalizes a title for cross-source matching (case, spacing, platform suffixes). */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(steam\)/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

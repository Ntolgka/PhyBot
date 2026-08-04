export const GAME_STORES = ['steam', 'epic', 'gog', 'ubisoft', 'itchio', 'other'] as const;
export type GameStore = (typeof GAME_STORES)[number];

export interface FreeGameOffer {
  /** Stable key built from store + game id, used to avoid double posting. */
  id: string;
  store: GameStore;
  title: string;
  description: string;
  url: string;
  imageUrl: string | null;
  /** Original price formatted by the store, empty when unknown. */
  originalPrice: string;
  /** Epoch milliseconds; null when the store gives no end date. */
  startsAt: number | null;
  endsAt: number | null;
  /** True for permanent giveaways (keep forever). */
  keepForever: boolean;
  fetchedAt: number;
}

export interface FreeGamePost {
  offerId: string;
  guildId: string;
  channelId: string;
  messageId: string;
  postedAt: number;
}

export interface FreeGamesStatus {
  enabled: boolean;
  lastCheckedAt: number | null;
  lastError: string | null;
  nextCheckAt: number | null;
  offers: FreeGameOffer[];
}

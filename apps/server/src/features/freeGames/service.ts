import { Cron } from 'croner';
import type { FreeGameOffer, FreeGamesStatus, GuildSettings } from '@phybot/shared';
import { bus } from '../../core/bus.js';
import { config } from '../../core/config.js';
import { AppError, NotFoundError, toErrorMessage } from '../../core/errors.js';
import { createLogger } from '../../core/logger.js';
import { freeGamePostsRepository } from '../../db/repositories/misc.js';
import { settingsRepository } from '../../db/repositories/settings.js';
import { STATE_KEYS, stateRepository } from '../../db/repositories/state.js';
import { tryGetClient } from '../../discord/client.js';
import { resolveSendableChannel } from '../discordHelpers.js';
import { claimButtonRow, offerEmbed } from './embeds.js';
import { dedupeOffers, normalizeTitle } from './normalize.js';
import { fetchEpicFreeGames } from './providers/epic.js';
import { fetchSteamFreeGames } from './providers/steam.js';

const log = createLogger('freegames');

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const INITIAL_RUN_DELAY_MS = 20_000;

interface FreeGamesMeta {
  lastCheckedAt: number | null;
  lastError: string | null;
  nextCheckAt: number | null;
}

const EMPTY_META: FreeGamesMeta = { lastCheckedAt: null, lastError: null, nextCheckAt: null };

function readCache(): FreeGameOffer[] {
  return stateRepository.get<FreeGameOffer[]>(STATE_KEYS.freeGamesCache, []);
}

function readMeta(): FreeGamesMeta {
  return stateRepository.get<FreeGamesMeta>(STATE_KEYS.freeGamesMeta, EMPTY_META);
}

export function getFreeGamesStatus(): FreeGamesStatus {
  const meta = readMeta();
  return {
    enabled: true,
    lastCheckedAt: meta.lastCheckedAt,
    lastError: meta.lastError,
    nextCheckAt: meta.nextCheckAt,
    offers: readCache(),
  };
}

async function postOffer(settings: GuildSettings, offer: FreeGameOffer): Promise<void> {
  const client = tryGetClient();
  if (!client?.isReady())
    throw new AppError('bot_offline', 'The bot is not connected to Discord', 503);
  const channelId = settings.freeGamesChannelId;
  if (!channelId)
    throw new AppError('no_channel', 'No free games channel is configured for this server', 400);

  const channel = await resolveSendableChannel(client, channelId);
  if (!channel) {
    throw new AppError(
      'invalid_channel',
      'The configured free games channel is missing or not usable',
      404,
    );
  }

  const content = settings.freeGamesRoleId ? `<@&${settings.freeGamesRoleId}>` : undefined;
  const message = await channel.send({
    content,
    embeds: [offerEmbed(offer)],
    components: [claimButtonRow(offer)],
  });

  freeGamePostsRepository.record({
    offerId: offer.id,
    guildId: settings.guildId,
    channelId,
    messageId: message.id,
    postedAt: Date.now(),
    titleKey: normalizeTitle(offer.title),
  });
}

async function announceNewOffers(offers: FreeGameOffer[]): Promise<void> {
  const client = tryGetClient();
  if (!client?.isReady()) return;

  const eligibleGuilds = settingsRepository
    .all()
    .filter((settings) => settings.freeGamesEnabled && settings.freeGamesChannelId);

  for (const settings of eligibleGuilds) {
    const matching = offers.filter((offer) => settings.freeGamesStores.includes(offer.store));
    for (const offer of matching) {
      if (
        freeGamePostsRepository.wasPosted(offer.id, settings.guildId, normalizeTitle(offer.title))
      )
        continue;
      try {
        await postOffer(settings, offer);
      } catch (error) {
        log.warn(
          { err: error, guildId: settings.guildId, offerId: offer.id },
          'Could not announce a free game offer',
        );
      }
    }
  }
}

/**
 * Fetches both providers, merges and caches the offers, then (by default)
 * announces new ones. A provider failure falls back to that store's
 * previously cached offers rather than wiping the dashboard's data.
 */
export async function refreshFreeGames(
  options: { announce?: boolean } = {},
): Promise<FreeGamesStatus> {
  const previous = readCache();
  const [epicResult, steamResult] = await Promise.allSettled([
    fetchEpicFreeGames(),
    fetchSteamFreeGames(),
  ]);

  const errors: string[] = [];

  let epicOffers: FreeGameOffer[];
  if (epicResult.status === 'fulfilled') {
    epicOffers = epicResult.value;
  } else {
    epicOffers = previous.filter((offer) => offer.store === 'epic');
    errors.push(`Epic: ${toErrorMessage(epicResult.reason)}`);
    log.warn({ err: epicResult.reason }, 'Epic Games fetch failed, keeping cached offers');
  }

  let steamOffers: FreeGameOffer[];
  if (steamResult.status === 'fulfilled') {
    steamOffers = steamResult.value;
  } else {
    steamOffers = previous.filter((offer) => offer.store === 'steam');
    errors.push(`Steam: ${toErrorMessage(steamResult.reason)}`);
    log.warn({ err: steamResult.reason }, 'Steam fetch failed, keeping cached offers');
  }

  const merged = dedupeOffers([...epicOffers, ...steamOffers]);
  stateRepository.set(STATE_KEYS.freeGamesCache, merged);

  const now = Date.now();
  const lastError = errors.length > 0 ? errors.join('; ') : null;
  const meta: FreeGamesMeta = {
    lastCheckedAt: now,
    lastError,
    nextCheckAt: now + REFRESH_INTERVAL_MS,
  };
  stateRepository.set(STATE_KEYS.freeGamesMeta, meta);

  const status = getFreeGamesStatus();
  bus.emit('freegames:update', status);

  if (lastError) {
    bus.emit('notice', {
      level: errors.length === 2 ? 'error' : 'warn',
      message: `Free games refresh had issues: ${lastError}`,
    });
  }

  if (options.announce ?? true) {
    await announceNewOffers(merged).catch((error: unknown) => {
      log.error({ err: error }, 'Failed to announce free game offers');
    });
  }

  return status;
}

/** Explicitly (re-)posts one cached offer to a guild's configured channel. */
export async function announceOffer(guildId: string, offerId: string): Promise<void> {
  const offer = readCache().find((candidate) => candidate.id === offerId);
  if (!offer) throw new NotFoundError('That offer is no longer available');

  const settings = settingsRepository.get(guildId);
  if (!settings.freeGamesChannelId) {
    throw new AppError('no_channel', 'Set a free games channel for this server first', 400);
  }
  await postOffer(settings, offer);
}

let refreshJob: Cron | null = null;
let initialTimer: NodeJS.Timeout | null = null;

/** Starts the 30-minute refresh cycle, plus one warm-up run shortly after boot. Safe to call once. */
export function startFreeGamesScheduler(): void {
  if (refreshJob) return;

  refreshJob = new Cron(
    '*/30 * * * *',
    {
      timezone: config.timezone,
      protect: true,
      catch: (error: unknown) => log.error({ err: error }, 'Scheduled free games refresh failed'),
    },
    () => {
      void refreshFreeGames().catch((error: unknown) => {
        log.error({ err: error }, 'Scheduled free games refresh failed');
      });
    },
  );

  initialTimer = setTimeout(() => {
    initialTimer = null;
    void refreshFreeGames().catch((error: unknown) => {
      log.error({ err: error }, 'Initial free games refresh failed');
    });
  }, INITIAL_RUN_DELAY_MS);
}

export function stopFreeGamesScheduler(): void {
  refreshJob?.stop();
  refreshJob = null;
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
}

import { Client, GatewayIntentBits, Options, Partials } from 'discord.js';
import type { BotStatus } from '@phybot/shared';
import { bus } from '../core/bus.js';
import { config } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { AppError, toErrorMessage } from '../core/errors.js';
import { playerManager } from '../music/manager.js';

const log = createLogger('discord');

let client: Client | null = null;
let startedAt: number | null = null;
let lastError: string | null = null;

export const APP_VERSION = '1.0.0';

/** The single Discord client instance; throws when the bot is not running. */
export function getClient(): Client {
  if (!client) {
    throw new AppError('bot_offline', 'The bot is not connected to Discord', 503);
  }
  return client;
}

export function tryGetClient(): Client | null {
  return client;
}

export function isReady(): boolean {
  return Boolean(client?.isReady());
}

export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
    // Message caching is only needed for the short lived command flows.
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: 50,
      ReactionManager: 0,
    }),
  });
}

export interface StartResult {
  ok: boolean;
  error?: string;
}

export async function startBot(instance: Client, token: string): Promise<StartResult> {
  client = instance;
  try {
    await instance.login(token);
    startedAt = Date.now();
    lastError = null;
    return { ok: true };
  } catch (error) {
    const message = toErrorMessage(error);
    lastError = describeLoginError(message);
    log.error({ err: error }, `Discord login failed: ${lastError}`);
    client = null;
    return { ok: false, error: lastError };
  }
}

/** Turns Discord's terse login errors into something actionable. */
function describeLoginError(message: string): string {
  if (message.includes('disallowed intents')) {
    return 'Discord rejected the privileged intents. Enable "Server Members Intent" and "Message Content Intent" on the Bot page of your application, then restart.';
  }
  if (message.toLowerCase().includes('token')) {
    return 'The bot token was rejected. Check DISCORD_TOKEN in .env.';
  }
  return message;
}

export async function stopBot(): Promise<void> {
  playerManager.destroyAll();
  if (!client) return;
  try {
    await client.destroy();
  } finally {
    client = null;
    startedAt = null;
  }
}

export function setLastError(message: string | null): void {
  lastError = message;
}

export function getStatus(): BotStatus {
  const memory = process.memoryUsage().rss / (1024 * 1024);
  const ready = Boolean(client?.isReady());
  return {
    online: Boolean(client),
    ready,
    ping: ready ? Math.max(-1, Math.round(client?.ws.ping ?? -1)) : -1,
    uptimeSeconds: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
    guildCount: client?.guilds.cache.size ?? 0,
    userCount: client?.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0) ?? 0,
    activePlayers: playerManager.list().length,
    memoryMb: Math.round(memory * 10) / 10,
    version: APP_VERSION,
    startedAt,
    lastError,
  };
}

/** Broadcasts the bot status to the dashboard on a slow interval. */
export function startStatusBroadcast(): NodeJS.Timeout {
  return setInterval(() => bus.emit('bot:status', getStatus()), 10_000);
}

export const ownerId = config.discord.ownerId;

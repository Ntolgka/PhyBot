import { Events, type Client, type GuildMember, type PartialGuildMember } from 'discord.js';
import type { GuildSummary } from '@phybot/shared';
import { bus } from '../core/bus.js';
import { config } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { toErrorMessage } from '../core/errors.js';
import { handleMemberJoin, handleMemberLeave, startFeatureSchedulers } from '../features/index.js';
import { playerManager } from '../music/manager.js';
import { registerMusicAnnouncements } from './announcer.js';
import { createClient, getStatus, setLastError, startBot, startStatusBroadcast } from './client.js';
import { deployCommands } from './deploy.js';
import { handleInteraction } from './interactions.js';
import { handleMessage } from './messages.js';
import { restorePanels } from './panel.js';
import { applyPresence, registerPresenceUpdates } from './presence.js';

const log = createLogger('discord');

export function listGuilds(client: Client): GuildSummary[] {
  return client.guilds.cache
    .map((guild) => ({
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconURL({ size: 128 }),
      memberCount: guild.memberCount,
      hasPlayer: playerManager.has(guild.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function publishGuilds(client: Client): void {
  bus.emit('guilds:update', listGuilds(client));
}

function registerEvents(client: Client): void {
  client.once(Events.ClientReady, async (ready) => {
    log.info(`Signed in as ${ready.user.tag} in ${ready.guilds.cache.size} servers`);

    try {
      const count = await deployCommands();
      log.info(`${count} slash commands are registered`);
    } catch (error) {
      log.error(`Slash command registration failed: ${toErrorMessage(error)}`);
      setLastError(`Slash command registration failed: ${toErrorMessage(error)}`);
    }

    applyPresence();
    startFeatureSchedulers();
    // Redraw the music panels so their buttons work again after a restart.
    await restorePanels();
    publishGuilds(ready);
    bus.emit('bot:status', getStatus());
  });

  client.on(Events.InteractionCreate, (interaction) => {
    void handleInteraction(interaction);
  });

  client.on(Events.MessageCreate, (message) => {
    void handleMessage(message).catch((error: unknown) => {
      log.warn(`Message handling failed: ${toErrorMessage(error)}`);
    });
  });

  client.on(Events.GuildMemberAdd, (member: GuildMember) => {
    void handleMemberJoin(member);
  });

  client.on(Events.GuildMemberRemove, (member: GuildMember | PartialGuildMember) => {
    void handleMemberLeave(member);
  });

  client.on(Events.GuildCreate, (guild) => {
    log.info(`Joined ${guild.name}`);
    publishGuilds(guild.client);
  });

  client.on(Events.GuildDelete, (guild) => {
    playerManager.destroy(guild.id);
    publishGuilds(guild.client);
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    // The bot was moved or disconnected by a moderator.
    if (oldState.id !== client.user?.id) return;
    if (oldState.channelId && !newState.channelId) {
      playerManager.destroy(oldState.guild.id);
    }
  });

  client.on(Events.Error, (error) => {
    log.error({ err: error }, 'Discord client error');
    setLastError(toErrorMessage(error));
  });

  client.on(Events.Warn, (message) => log.warn(message));

  playerManager.on('created', () => publishGuilds(client));
  playerManager.on('destroyed', () => publishGuilds(client));
}

export interface DiscordRuntime {
  client: Client | null;
  statusTimer: NodeJS.Timeout | null;
}

/**
 * Boots the Discord side of the bot. When credentials are missing the API and
 * dashboard still start so the problem can be fixed without editing files.
 */
export async function startDiscord(): Promise<DiscordRuntime> {
  if (!config.discord.configured || !config.discord.token) {
    const message =
      'DISCORD_TOKEN and DISCORD_CLIENT_ID are not set in .env, so the bot stays offline. The dashboard is still available.';
    log.warn(message);
    setLastError(message);
    return { client: null, statusTimer: null };
  }

  const client = createClient();
  registerEvents(client);
  registerMusicAnnouncements();
  registerPresenceUpdates();

  const result = await startBot(client, config.discord.token);
  if (!result.ok) {
    return { client: null, statusTimer: null };
  }

  return { client, statusTimer: startStatusBroadcast() };
}

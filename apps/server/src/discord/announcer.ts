import { ChannelType, type SendableChannels } from 'discord.js';
import { truncate } from '@phybot/shared';
import { createLogger } from '../core/logger.js';
import { toErrorMessage } from '../core/errors.js';
import { settingsRepository } from '../db/repositories/settings.js';
import { playerManager } from '../music/manager.js';
import { errorEmbed } from './embeds.js';
import { tryGetClient } from './client.js';
import { registerMusicPanel } from './panel.js';
import { registerVoiceStatus } from './voiceStatus.js';

const log = createLogger('announcer');

/** Playback problems are posted separately from the panel and clean up after themselves. */
const NOTICE_LIFETIME_MS = 30_000;

async function resolveChannel(guildId: string): Promise<SendableChannels | null> {
  const client = tryGetClient();
  if (!client?.isReady()) return null;
  const settings = settingsRepository.get(guildId);
  const channelId = settings.musicTextChannelId ?? playerManager.get(guildId)?.textChannelId;
  if (!channelId) return null;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type === ChannelType.DM || !channel.isSendable()) return null;
    return channel;
  } catch (error) {
    log.debug({ guildId }, `Could not resolve the music channel: ${toErrorMessage(error)}`);
    return null;
  }
}

/**
 * Wires everything the music channel and voice channel show: the live panel,
 * the channel status, and short lived error notices.
 */
export function registerMusicAnnouncements(): void {
  registerMusicPanel();
  registerVoiceStatus();

  playerManager.on('error', async ({ guildId, message }) => {
    const channel = await resolveChannel(guildId);
    if (!channel) return;
    try {
      const notice = await channel.send({
        embeds: [errorEmbed(truncate(message, 300), 'Playback problem')],
      });
      setTimeout(() => {
        notice.delete().catch(() => undefined);
      }, NOTICE_LIFETIME_MS).unref();
    } catch {
      // Nothing else to do if the channel is unavailable.
    }
  });
}

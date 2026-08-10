import { ChannelType, type SendableChannels } from 'discord.js';
import { AppError, toErrorMessage } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import { tryGetClient } from './client.js';

const log = createLogger('send');

export interface SendMessageParams {
  guildId: string;
  channelId: string;
  content: string;
  /** Who asked for it, recorded in the log rather than shown in the message. */
  requestedBy?: string;
}

export interface SentMessage {
  messageId: string;
  channelId: string;
  channelName: string;
}

/**
 * Resolves a channel the bot may post in, refusing anything outside the given
 * server so a channel id from another guild cannot be used as a way to post
 * where the dashboard was never meant to reach.
 */
async function resolveTextChannel(guildId: string, channelId: string): Promise<SendableChannels> {
  const client = tryGetClient();
  if (!client?.isReady()) {
    throw new AppError('bot_offline', 'The bot is not connected to Discord', 503);
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type === ChannelType.DM) {
    throw new AppError('channel_not_found', 'That channel does not exist', 404);
  }
  if (!('guildId' in channel) || channel.guildId !== guildId) {
    throw new AppError('channel_not_found', 'That channel is not in this server', 404);
  }
  if (!channel.isSendable()) {
    throw new AppError(
      'channel_not_writable',
      'The bot cannot post in that channel. Check its permissions.',
      403,
    );
  }
  return channel;
}

/** Posts a plain message as the bot. */
export async function sendMessage(params: SendMessageParams): Promise<SentMessage> {
  const content = params.content.trim();
  if (!content) {
    throw new AppError('empty_message', 'Write something to send', 400);
  }

  const channel = await resolveTextChannel(params.guildId, params.channelId);
  try {
    const message = await channel.send({
      content,
      // The dashboard is trusted to write the text, but not to decide who gets
      // pinged by it: @everyone and role mentions stay inert.
      allowedMentions: { parse: ['users'] },
    });
    log.info(
      {
        guildId: params.guildId,
        channelId: params.channelId,
        by: params.requestedBy ?? 'dashboard',
      },
      'Sent a message',
    );
    return {
      messageId: message.id,
      channelId: channel.id,
      channelName: 'name' in channel ? channel.name : 'channel',
    };
  } catch (error) {
    throw new AppError('send_failed', `Discord refused the message: ${toErrorMessage(error)}`, 502);
  }
}

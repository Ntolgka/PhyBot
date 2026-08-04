import type { Message } from 'discord.js';
import { truncate } from '@phybot/shared';
import { chat, isConfigured } from '../ai/index.js';
import { createLogger } from '../core/logger.js';
import { toErrorMessage } from '../core/errors.js';
import { settingsRepository } from '../db/repositories/settings.js';
import { findCustomCommand, renderCustomCommand } from './customCommands.js';
import { notePanelChannelMessage } from './panel.js';

const log = createLogger('messages');

/**
 * Message based entry points: prefix custom commands, plus the assistant when
 * it is mentioned or posting in its dedicated channel.
 */
export async function handleMessage(message: Message): Promise<void> {
  if (message.author.bot || !message.inGuild()) return;

  const settings = settingsRepository.get(message.guildId);
  const content = message.content.trim();

  // Keeps the live music panel at the bottom of a busy channel.
  notePanelChannelMessage(message.guildId, message.channelId);

  if (content.startsWith(settings.prefix)) {
    const name = content.slice(settings.prefix.length).split(/\s+/)[0]?.toLowerCase();
    if (name) {
      const command = findCustomCommand(message.guildId, name);
      if (command && message.member) {
        const rendered = renderCustomCommand(command, message.member);
        if (rendered.allowed && rendered.message) {
          await message.reply(rendered.message).catch(() => undefined);
        } else if (rendered.reason) {
          await message.reply({ content: rendered.reason }).catch(() => undefined);
        }
        return;
      }
    }
  }

  if (!settings.aiEnabled || !isConfigured()) return;

  const mentioned = message.mentions.users.has(message.client.user.id);
  const inAiChannel = settings.aiTextChannelId === message.channelId;
  if (!mentioned && !inAiChannel) return;

  const prompt = content.replace(/<@!?\d+>/g, '').trim();
  if (!prompt) return;

  try {
    await message.channel.sendTyping().catch(() => undefined);
    const reply = await chat({
      message: prompt,
      userId: message.author.id,
      userName: message.member?.displayName ?? message.author.username,
      guildId: message.guildId,
      channelId: message.channelId,
    });
    await message.reply({ content: truncate(reply, 1900) });
  } catch (error) {
    log.warn(`Assistant reply failed: ${toErrorMessage(error)}`);
    await message
      .reply({ content: 'The assistant could not answer right now.' })
      .catch(() => undefined);
  }
}

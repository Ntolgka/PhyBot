import { EmbedBuilder, type GuildMember, type MessageCreateOptions } from 'discord.js';
import type { CustomCommand } from '@phybot/shared';
import { applyTemplate } from '@phybot/shared';
import { commandsRepository } from '../db/repositories/commands.js';
import { COLORS } from './embeds.js';

export interface CustomCommandRender {
  allowed: boolean;
  /** Reason shown to the user when the command is not allowed. */
  reason?: string;
  message?: MessageCreateOptions;
}

function pickContent(command: CustomCommand): string {
  if (command.type !== 'random') return command.content;
  const options = command.content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (options.length === 0) return '';
  return options[Math.floor(Math.random() * options.length)] ?? '';
}

/** Builds the reply for a custom command, or explains why it cannot run. */
export function renderCustomCommand(
  command: CustomCommand,
  member: GuildMember,
): CustomCommandRender {
  if (!command.enabled) {
    return { allowed: false, reason: 'That command is disabled.' };
  }
  if (command.requiredRoleId && !member.roles.cache.has(command.requiredRoleId)) {
    return { allowed: false, reason: 'You do not have the role required for that command.' };
  }

  const values = {
    user: `<@${member.id}>`,
    username: member.displayName,
    server: member.guild.name,
    memberCount: member.guild.memberCount,
  };
  const content = applyTemplate(pickContent(command), values);
  commandsRepository.incrementUses(command.id);

  if (command.type === 'embed') {
    const embed = new EmbedBuilder()
      .setColor(
        command.embedColor
          ? Number.parseInt(command.embedColor.replace('#', ''), 16)
          : COLORS.brand,
      )
      .setDescription(content || null);
    if (command.embedTitle) embed.setTitle(applyTemplate(command.embedTitle, values));
    if (command.embedImageUrl) embed.setImage(command.embedImageUrl);
    return { allowed: true, message: { embeds: [embed] } };
  }

  return { allowed: true, message: { content: content || '​' } };
}

export function findCustomCommand(guildId: string, name: string): CustomCommand | null {
  return commandsRepository.getByName(guildId, name);
}

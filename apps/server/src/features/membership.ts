import { EmbedBuilder, type GuildMember, type PartialGuildMember } from 'discord.js';
import { applyTemplate, truncate } from '@phybot/shared';
import { createLogger } from '../core/logger.js';
import { settingsRepository } from '../db/repositories/settings.js';
import { checkRoleAssignable, resolveSendableChannel } from './discordHelpers.js';

const log = createLogger('membership');

const WELCOME_COLOR = 0x3ba55d;
const GOODBYE_COLOR = 0xed4245;

/** Grants the configured auto-role, logging (never throwing) on any failure. */
async function assignAutoRole(member: GuildMember): Promise<void> {
  const settings = settingsRepository.get(member.guild.id);
  if (!settings.autoRoleEnabled) return;

  const roleId = member.user.bot
    ? (settings.autoRoleBotId ?? settings.autoRoleId)
    : settings.autoRoleId;
  if (!roleId) return;

  const role = member.guild.roles.cache.get(roleId);
  if (!role) {
    log.warn(
      { guildId: member.guild.id, roleId },
      'Auto-role is configured but the role no longer exists',
    );
    return;
  }

  const check = checkRoleAssignable(role, member.guild);
  if (!check.assignable) {
    log.warn({ guildId: member.guild.id, roleId }, `Cannot grant auto-role: ${check.reason}`);
    return;
  }

  try {
    await member.roles.add(role, 'Auto-role on join');
  } catch (error) {
    log.warn({ err: error, guildId: member.guild.id, roleId }, 'Failed to grant auto-role');
  }
}

/** Posts the welcome/goodbye embed for a member, using the configured template. */
async function postGreeting(
  kind: 'welcome' | 'goodbye',
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  const settings = settingsRepository.get(member.guild.id);
  const enabled = kind === 'welcome' ? settings.welcomeEnabled : settings.goodbyeEnabled;
  const channelId = kind === 'welcome' ? settings.welcomeChannelId : settings.goodbyeChannelId;
  const template = kind === 'welcome' ? settings.welcomeMessage : settings.goodbyeMessage;
  if (!enabled || !channelId) return;

  const channel = await resolveSendableChannel(member.client, channelId);
  if (!channel) {
    log.warn(
      { guildId: member.guild.id, channelId },
      `Cannot post ${kind} message: channel is missing or the bot cannot post there`,
    );
    return;
  }

  const mention = kind === 'welcome' ? `<@${member.id}>` : member.user.tag;
  const text = truncate(
    applyTemplate(template, {
      user: mention,
      username: member.user.username,
      server: member.guild.name,
      memberCount: member.guild.memberCount,
    }),
    2000,
  );

  const embed = new EmbedBuilder()
    .setColor(kind === 'welcome' ? WELCOME_COLOR : GOODBYE_COLOR)
    .setDescription(
      text || (kind === 'welcome' ? `Welcome, ${mention}!` : `${mention} left the server.`),
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: kind === 'welcome' ? 'Welcome' : 'Goodbye' })
    .setTimestamp();

  try {
    await channel.send({ embeds: [embed] });
  } catch (error) {
    log.warn({ err: error, guildId: member.guild.id, channelId }, `Failed to post ${kind} message`);
  }
}

/** Handles a new member: grants the auto-role, then posts the welcome message. Never throws. */
export async function handleMemberJoin(member: GuildMember): Promise<void> {
  try {
    await assignAutoRole(member);
  } catch (error) {
    log.error(
      { err: error, guildId: member.guild.id },
      'Unexpected error while assigning the auto-role',
    );
  }

  try {
    await postGreeting('welcome', member);
  } catch (error) {
    log.error(
      { err: error, guildId: member.guild.id },
      'Unexpected error while posting the welcome message',
    );
  }
}

/** Handles a departing member: posts the goodbye message. Never throws. */
export async function handleMemberLeave(member: PartialGuildMember | GuildMember): Promise<void> {
  try {
    await postGreeting('goodbye', member);
  } catch (error) {
    log.error(
      { err: error, guildId: member.guild.id },
      'Unexpected error while posting the goodbye message',
    );
  }
}

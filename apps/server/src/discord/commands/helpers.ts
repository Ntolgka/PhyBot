import { PermissionsBitField, type GuildMember, type VoiceBasedChannel } from 'discord.js';
import type { GuildSettings } from '@phybot/shared';
import { AppError } from '../../core/errors.js';
import { playerManager } from '../../music/manager.js';
import type { GuildPlayer } from '../../music/player.js';
import { config } from '../../core/config.js';
import type { CommandPermission } from './types.js';

export function memberVoiceChannel(member: GuildMember): VoiceBasedChannel | null {
  return member.voice.channel ?? null;
}

export function requireVoiceChannel(member: GuildMember): VoiceBasedChannel {
  const channel = memberVoiceChannel(member);
  if (!channel) throw new AppError('not_in_voice', 'Join a voice channel first.', 400);
  return channel;
}

export function requirePlayer(guildId: string): GuildPlayer {
  const player = playerManager.get(guildId);
  if (!player) throw new AppError('no_player', 'Nothing is playing right now.', 409);
  return player;
}

/**
 * Members must be in the same voice channel as the bot to control playback,
 * unless they can manage the server.
 */
export function assertSameVoiceChannel(member: GuildMember, player: GuildPlayer): void {
  if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return;
  if (member.voice.channelId === player.channelId) return;
  throw new AppError(
    'wrong_channel',
    'You need to be in the same voice channel as the bot to do that.',
    403,
  );
}

export function hasPermission(
  member: GuildMember,
  settings: GuildSettings,
  permission: CommandPermission = 'everyone',
): boolean {
  switch (permission) {
    case 'everyone':
      return true;
    case 'dj':
      if (!settings.djRoleId) return true;
      return (
        member.roles.cache.has(settings.djRoleId) ||
        member.permissions.has(PermissionsBitField.Flags.ManageGuild)
      );
    case 'manage':
      return member.permissions.has(PermissionsBitField.Flags.ManageGuild);
    case 'owner':
      return member.id === config.discord.ownerId || member.id === member.guild.ownerId;
    default:
      return false;
  }
}

export function permissionMessage(permission: CommandPermission): string {
  switch (permission) {
    case 'dj':
      return 'You need the DJ role to use this command.';
    case 'manage':
      return 'You need the Manage Server permission to use this command.';
    case 'owner':
      return 'Only the bot owner can use this command.';
    default:
      return 'You cannot use this command.';
  }
}

/** Accepts "83", "1:23" or "1:02:03" and returns seconds. */
export function parseTimestamp(input: string): number {
  const trimmed = input.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);

  const parts = trimmed.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
    throw new AppError('bad_timestamp', 'Use a position like 90, 1:30 or 1:02:03.', 400);
  }
  if (parts.length === 2) {
    const [minutes = 0, seconds = 0] = parts;
    return minutes * 60 + seconds;
  }
  if (parts.length === 3) {
    const [hours = 0, minutes = 0, seconds = 0] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }
  throw new AppError('bad_timestamp', 'Use a position like 90, 1:30 or 1:02:03.', 400);
}

import { ChannelType, PermissionsBitField, type Guild } from 'discord.js';
import type { FastifyInstance } from 'fastify';
import {
  guildSettingsUpdateSchema,
  type ChannelSummary,
  type MemberSummary,
  type RoleSummary,
} from '@phybot/shared';
import { bus } from '../../core/bus.js';
import { NotFoundError } from '../../core/errors.js';
import { settingsRepository } from '../../db/repositories/settings.js';
import { tryGetClient } from '../../discord/client.js';
import { listGuilds } from '../../discord/index.js';
import { playerManager } from '../../music/manager.js';
import { parseBody } from '../validation.js';

function requireGuild(guildId: string): Guild {
  const guild = tryGetClient()?.guilds.cache.get(guildId);
  if (!guild) throw new NotFoundError('The bot is not a member of that server');
  return guild;
}

const CHANNEL_TYPES: Partial<Record<ChannelType, ChannelSummary['type']>> = {
  [ChannelType.GuildText]: 'text',
  [ChannelType.GuildVoice]: 'voice',
  [ChannelType.GuildStageVoice]: 'stage',
  [ChannelType.GuildForum]: 'forum',
  [ChannelType.GuildAnnouncement]: 'announcement',
  [ChannelType.GuildCategory]: 'category',
};

export async function guildRoutes(app: FastifyInstance): Promise<void> {
  app.get('/guilds', async () => {
    const client = tryGetClient();
    return client?.isReady() ? listGuilds(client) : [];
  });

  app.get('/guilds/:guildId/channels', async (request): Promise<ChannelSummary[]> => {
    const { guildId } = request.params as { guildId: string };
    const guild = requireGuild(guildId);
    const me = guild.members.me;

    return guild.channels.cache
      .map((channel) => {
        const type = CHANNEL_TYPES[channel.type] ?? 'other';
        const permissions = me && 'permissionsFor' in channel ? channel.permissionsFor(me) : null;
        const usable =
          type === 'category'
            ? false
            : type === 'voice' || type === 'stage'
              ? Boolean(
                  permissions?.has(PermissionsBitField.Flags.ViewChannel) &&
                  permissions.has(PermissionsBitField.Flags.Connect),
                )
              : Boolean(
                  permissions?.has(PermissionsBitField.Flags.ViewChannel) &&
                  permissions.has(PermissionsBitField.Flags.SendMessages),
                );
        return {
          id: channel.id,
          name: channel.name,
          type,
          parentName: 'parent' in channel ? (channel.parent?.name ?? null) : null,
          usable,
        } satisfies ChannelSummary;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  app.get('/guilds/:guildId/roles', async (request): Promise<RoleSummary[]> => {
    const { guildId } = request.params as { guildId: string };
    const guild = requireGuild(guildId);
    const botPosition = guild.members.me?.roles.highest.position ?? 0;
    const canManage =
      guild.members.me?.permissions.has(PermissionsBitField.Flags.ManageRoles) ?? false;

    return guild.roles.cache
      .filter((role) => role.id !== guild.id)
      .map((role) => {
        // Roles created by an integration can never be handed out; the other
        // two reasons are things the owner can fix in Discord.
        const blockedBy: RoleSummary['blockedBy'] = role.managed
          ? 'managed'
          : !canManage
            ? 'missing_permission'
            : role.position >= botPosition
              ? 'above_bot'
              : undefined;

        return {
          id: role.id,
          name: role.name,
          color: role.hexColor,
          position: role.position,
          assignable: blockedBy === undefined,
          managed: role.managed,
          ...(blockedBy ? { blockedBy } : {}),
        } satisfies RoleSummary;
      })
      .sort((a, b) => b.position - a.position);
  });

  app.get('/guilds/:guildId/members', async (request): Promise<MemberSummary[]> => {
    const { guildId } = request.params as { guildId: string };
    const { query } = request.query as { query?: string };
    const guild = requireGuild(guildId);

    const members = query
      ? await guild.members.fetch({ query, limit: 25 })
      : await guild.members.fetch({ limit: 25 });

    return members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      avatarUrl: member.displayAvatarURL({ size: 64 }),
      bot: member.user.bot,
    }));
  });

  app.get('/guilds/:guildId/settings', async (request) => {
    const { guildId } = request.params as { guildId: string };
    requireGuild(guildId);
    return settingsRepository.get(guildId);
  });

  app.patch('/guilds/:guildId/settings', async (request) => {
    const { guildId } = request.params as { guildId: string };
    requireGuild(guildId);
    const patch = parseBody(guildSettingsUpdateSchema, request.body);
    const updated = settingsRepository.update(guildId, patch);

    const player = playerManager.get(guildId);
    if (player) {
      if (patch.idleTimeoutSeconds !== undefined) player.setIdleTimeout(updated.idleTimeoutSeconds);
      if (patch.musicTextChannelId !== undefined) player.setTextChannel(updated.musicTextChannelId);
    }

    bus.emit('settings:update', updated);
    return updated;
  });
}

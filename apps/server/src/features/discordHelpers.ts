import {
  PermissionsBitField,
  type Client,
  type Guild,
  type GuildTextBasedChannel,
  type Role,
} from 'discord.js';

/**
 * Resolves a channel id to a channel the bot can actually post embeds/messages
 * in. Returns null (never throws) when the channel is missing, not text based,
 * a DM, or the bot lacks View Channel / Send Messages there.
 */
export async function resolveSendableChannel(
  client: Client,
  channelId: string,
): Promise<GuildTextBasedChannel | null> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return null;

    const me = channel.guild.members.me;
    const permissions = me ? channel.permissionsFor(me) : null;
    if (
      !permissions ||
      !permissions.has(PermissionsBitField.Flags.ViewChannel) ||
      !permissions.has(PermissionsBitField.Flags.SendMessages)
    ) {
      return null;
    }
    return channel;
  } catch {
    return null;
  }
}

export interface RoleAssignability {
  assignable: boolean;
  reason?: string;
}

/** Checks whether the bot is currently able to add/remove this role from members. */
export function checkRoleAssignable(role: Role, guild: Guild): RoleAssignability {
  if (role.managed) {
    return {
      assignable: false,
      reason: `"${role.name}" is managed by an integration and cannot be assigned manually.`,
    };
  }

  const me = guild.members.me;
  if (!me) {
    return { assignable: false, reason: 'The bot member could not be resolved in this server.' };
  }
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return { assignable: false, reason: 'The bot is missing the "Manage Roles" permission.' };
  }
  if (!role.editable) {
    return {
      assignable: false,
      reason: `"${role.name}" is positioned above the bot's highest role.`,
    };
  }
  return { assignable: true };
}

import { MessageFlags, type ButtonInteraction } from 'discord.js';
import type { RolePanel, RolePanelInput } from '@phybot/shared';
import { AppError, NotFoundError } from '../../core/errors.js';
import { createLogger } from '../../core/logger.js';
import { rolePanelsRepository } from '../../db/repositories/rolePanels.js';
import { tryGetClient } from '../../discord/client.js';
import { checkRoleAssignable, resolveSendableChannel } from '../discordHelpers.js';
import { rolePanelComponents, rolePanelEmbed } from './embeds.js';
import { exclusiveRolesToRemove } from './logic.js';

const log = createLogger('rolepanels');
const MAX_OPTIONS = 25;

export function listPanels(guildId?: string): RolePanel[] {
  return rolePanelsRepository.list(guildId);
}

function getPanelOrThrow(id: number): RolePanel {
  const panel = rolePanelsRepository.getById(id);
  if (!panel) throw new NotFoundError('That role panel no longer exists');
  return panel;
}

function validateOptionCount(count: number): void {
  if (count === 0) throw new AppError('invalid_panel', 'Add at least one role to the panel', 400);
  if (count > MAX_OPTIONS) {
    throw new AppError('invalid_panel', `A role panel supports at most ${MAX_OPTIONS} roles`, 400);
  }
}

export async function createPanel(input: RolePanelInput): Promise<RolePanel> {
  validateOptionCount(input.options.length);
  return rolePanelsRepository.create(input);
}

export async function updatePanel(id: number, patch: Partial<RolePanelInput>): Promise<RolePanel> {
  getPanelOrThrow(id);
  if (patch.options) validateOptionCount(patch.options.length);

  const updated = rolePanelsRepository.update(id, patch);
  if (!updated) throw new NotFoundError('That role panel no longer exists');

  if (updated.messageId) {
    await refreshPanelMessage(updated).catch((error: unknown) => {
      log.warn({ err: error, panelId: id }, 'Could not refresh the role panel message');
    });
  }
  return updated;
}

export async function deletePanel(id: number): Promise<void> {
  const panel = getPanelOrThrow(id);
  if (panel.messageId) {
    const client = tryGetClient();
    if (client?.isReady()) {
      const channel = await resolveSendableChannel(client, panel.channelId);
      if (channel) {
        await channel.messages.delete(panel.messageId).catch((error: unknown) => {
          log.warn({ err: error, panelId: id }, 'Could not delete the role panel message');
        });
      }
    }
  }
  rolePanelsRepository.delete(id);
}

async function refreshPanelMessage(panel: RolePanel): Promise<void> {
  if (!panel.messageId) return;
  const client = tryGetClient();
  if (!client?.isReady()) return;
  const channel = await resolveSendableChannel(client, panel.channelId);
  if (!channel) return;
  await channel.messages.edit(panel.messageId, {
    embeds: [rolePanelEmbed(panel)],
    components: rolePanelComponents(panel),
  });
}

export async function publishPanel(id: number): Promise<RolePanel> {
  const panel = getPanelOrThrow(id);
  validateOptionCount(panel.options.length);

  const client = tryGetClient();
  if (!client?.isReady())
    throw new AppError('bot_offline', 'The bot is not connected to Discord', 503);

  const channel = await resolveSendableChannel(client, panel.channelId);
  if (!channel) {
    throw new AppError(
      'invalid_channel',
      'The configured channel is missing or the bot cannot post there',
      404,
    );
  }

  const payload = { embeds: [rolePanelEmbed(panel)], components: rolePanelComponents(panel) };

  if (panel.messageId) {
    try {
      await channel.messages.edit(panel.messageId, payload);
      return panel;
    } catch (error) {
      log.warn(
        { err: error, panelId: id },
        'Could not edit the existing role panel message, posting a new one',
      );
    }
  }

  const message = await channel.send(payload);
  rolePanelsRepository.setMessageId(id, message.id);
  return { ...panel, messageId: message.id };
}

export async function handleRolePanelInteraction(interaction: ButtonInteraction): Promise<void> {
  const [prefix, panelIdPart, roleIdPart] = interaction.customId.split(':');
  if (prefix !== 'rolepanel' || panelIdPart === undefined || roleIdPart === undefined) return;
  const panelId = Number(panelIdPart);
  if (!Number.isInteger(panelId)) return;
  const roleId = roleIdPart;

  try {
    const panel = rolePanelsRepository.getById(panelId);
    if (!panel) {
      await interaction.reply({
        content: 'This role panel no longer exists.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const option = panel.options.find((o) => o.roleId === roleId);
    if (!option) {
      await interaction.reply({
        content: 'That role is no longer part of this panel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: 'This can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      await interaction.reply({
        content: 'That role no longer exists.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const check = checkRoleAssignable(role, guild);
    if (!check.assignable) {
      await interaction.reply({
        content: check.reason ?? 'That role cannot be assigned right now.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = await guild.members.fetch(interaction.user.id);
    const hasRole = member.roles.cache.has(roleId);
    const changes: string[] = [];

    if (panel.exclusive && !hasRole) {
      const memberRoleIds = [...member.roles.cache.keys()];
      const toRemove = exclusiveRolesToRemove(panel.options, memberRoleIds, roleId);
      for (const otherId of toRemove) {
        try {
          await member.roles.remove(otherId, 'Role panel is exclusive');
          const otherOption = panel.options.find((o) => o.roleId === otherId);
          changes.push(`Removed ${otherOption?.label ?? 'a role'}`);
        } catch (error) {
          log.warn({ err: error, panelId, roleId: otherId }, 'Could not remove an exclusive role');
        }
      }
    }

    if (hasRole) {
      await member.roles.remove(roleId, 'Role panel toggle');
      changes.push(`Removed ${option.label}`);
    } else {
      await member.roles.add(roleId, 'Role panel toggle');
      changes.push(`Added ${option.label}`);
    }

    await interaction.reply({ content: changes.join('\n'), flags: MessageFlags.Ephemeral });
  } catch (error) {
    log.error(
      { err: error, customId: interaction.customId },
      'Failed to handle role panel interaction',
    );
    const content = 'Something went wrong updating your roles. Please try again.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

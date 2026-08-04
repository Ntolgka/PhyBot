import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import { SEEK_STEP_SECONDS, type LoopMode } from '@phybot/shared';
import { AppError, toErrorMessage } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import { settingsRepository } from '../db/repositories/settings.js';
import { handleEventInteraction, handleRolePanelInteraction } from '../features/index.js';
import { playerManager } from '../music/manager.js';
import { commandRegistry } from './commands/index.js';
import { executeSoundCommand, findSoundCommand } from './commands/soundboard.js';
import { hasPermission, permissionMessage } from './commands/helpers.js';
import { errorEmbed, musicControls, nowPlayingEmbed, queueEmbed, MUSIC_BUTTONS } from './embeds.js';
import { findCustomCommand, renderCustomCommand } from './customCommands.js';
import { respond } from './reply.js';

const log = createLogger('interactions');

export async function handleInteraction(interaction: Interaction): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }
    if (interaction.isButton()) {
      await handleButton(interaction);
    }
  } catch (error) {
    await reportError(interaction, error);
  }
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: 'PhyBot commands only work inside a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const settings = settingsRepository.get(interaction.guild.id);
  const command = commandRegistry.get(interaction.commandName);

  if (!command) {
    await runCustomCommand(interaction);
    return;
  }

  if (!hasPermission(member, settings, command.permission)) {
    await interaction.reply({
      embeds: [errorEmbed(permissionMessage(command.permission ?? 'everyone'), 'Not allowed')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await command.execute({ interaction, guild: interaction.guild, member, settings });
}

async function runCustomCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return;
  // A soundboard clip can also be registered under its own name.
  const sound = findSoundCommand(interaction.guild.id, interaction.commandName);
  if (sound) {
    await executeSoundCommand(interaction, sound);
    return;
  }

  const custom = findCustomCommand(interaction.guild.id, interaction.commandName);
  if (!custom) {
    await interaction.reply({
      content: 'That command is no longer available. Try /help.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const rendered = renderCustomCommand(custom, member);
  if (!rendered.allowed || !rendered.message) {
    await interaction.reply({
      content: rendered.reason ?? 'That command cannot run right now.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({
    content: rendered.message.content ?? undefined,
    embeds: rendered.message.embeds ?? [],
  });
}

const LOOP_ORDER: LoopMode[] = ['off', 'track', 'queue'];

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const { customId } = interaction;

  if (customId.startsWith('event:')) {
    await handleEventInteraction(interaction);
    return;
  }
  if (customId.startsWith('rolepanel:')) {
    await handleRolePanelInteraction(interaction);
    return;
  }
  if (!customId.startsWith('music:')) return;

  if (!interaction.guild) return;
  const player = playerManager.get(interaction.guild.id);
  if (!player) {
    await interaction.reply({
      embeds: [errorEmbed('Nothing is playing right now.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const settings = settingsRepository.get(interaction.guild.id);
  if (!hasPermission(member, settings, 'dj')) {
    await interaction.reply({
      embeds: [errorEmbed(permissionMessage('dj'), 'Not allowed')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();

  switch (customId) {
    case MUSIC_BUTTONS.previous:
      await player.previous();
      break;
    case MUSIC_BUTTONS.rewind:
      await player.seekRelative(-SEEK_STEP_SECONDS);
      break;
    case MUSIC_BUTTONS.toggle:
      player.togglePause();
      break;
    case MUSIC_BUTTONS.forward:
      await player.seekRelative(SEEK_STEP_SECONDS);
      break;
    case MUSIC_BUTTONS.skip:
      await player.skip();
      break;
    case MUSIC_BUTTONS.replay:
      await player.restart();
      break;
    case MUSIC_BUTTONS.loop: {
      const index = LOOP_ORDER.indexOf(player.queue.loop);
      player.setLoop(LOOP_ORDER[(index + 1) % LOOP_ORDER.length] ?? 'off');
      break;
    }
    case MUSIC_BUTTONS.shuffle:
      player.shuffleQueue();
      break;
    case MUSIC_BUTTONS.autoplay:
      player.setAutoplay(!player.autoplay);
      break;
    case MUSIC_BUTTONS.stop:
      player.stop(true);
      break;
    case MUSIC_BUTTONS.queue: {
      await interaction.followUp({
        embeds: [queueEmbed(player.snapshot())],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    default:
      return;
  }

  const snapshot = player.snapshot();
  await interaction.editReply({
    embeds: [nowPlayingEmbed(snapshot)],
    components: musicControls(snapshot),
  });
}

async function reportError(interaction: Interaction, error: unknown): Promise<void> {
  const message =
    error instanceof AppError ? error.message : `Something went wrong. ${toErrorMessage(error)}`;

  if (!(error instanceof AppError)) {
    log.error({ err: error }, 'Interaction failed');
  }

  if (!interaction.isRepliable()) return;
  await respond(interaction, {
    embeds: [errorEmbed(message)],
    flags: MessageFlags.Ephemeral,
  });
}

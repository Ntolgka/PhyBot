import {
  MessageFlags,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { SEEK_STEP_SECONDS, type LoopMode } from '@phybot/shared';
import { AppError, toErrorMessage } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import { historyRepository } from '../db/repositories/misc.js';
import { settingsRepository } from '../db/repositories/settings.js';
import { handleEventInteraction, handleRolePanelInteraction } from '../features/index.js';
import { playerManager } from '../music/manager.js';
import { play } from '../music/service.js';
import { suggestVoices } from './commands/assistant.js';
import { commandRegistry } from './commands/index.js';
import { handleFluxButton, handleFluxSelect } from './commands/imagine.js';
import { executeSoundCommand, findSoundCommand } from './commands/soundboard.js';
import { hasPermission, permissionMessage } from './commands/helpers.js';
import {
  errorEmbed,
  musicControls,
  nowPlayingEmbed,
  panelEmbed,
  queueBrowser,
  queueEmbed,
  MUSIC_BUTTONS,
  QUEUE_BROWSE_PREFIX,
  QUEUE_PAGE_SIZE,
  QUEUE_PICK_ID,
} from './embeds.js';
import { isPanelMessage } from './panel.js';
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
      return;
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('music:')) await handleQueuePick(interaction);
      else await handleFluxSelect(interaction);
      return;
    }
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
    }
  } catch (error) {
    await reportError(interaction, error);
  }
}

/** Only the /say voice option offers suggestions today. */
async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (interaction.commandName !== 'say') {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused();
  await interaction.respond(suggestVoices(focused));
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
  if (customId.startsWith('flux:')) {
    await handleFluxButton(interaction);
    return;
  }
  if (customId.startsWith('rolepanel:')) {
    await handleRolePanelInteraction(interaction);
    return;
  }
  if (!customId.startsWith('music:')) return;

  if (!interaction.guild) return;
  if (customId.startsWith(QUEUE_BROWSE_PREFIX)) {
    await showQueuePage(interaction, Number(customId.slice(QUEUE_BROWSE_PREFIX.length)) || 0, true);
    return;
  }
  const player = playerManager.get(interaction.guild.id);
  if (!player) {
    // Play again is the whole point of the message posted once playback ends,
    // by which time the idle timeout has usually disconnected the player.
    if (customId === MUSIC_BUTTONS.replay) {
      await replayLastTrack(interaction);
      return;
    }
    await interaction.reply({
      embeds: [errorEmbed('Nothing is playing right now.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Looking at the queue changes nothing, so it does not need the DJ role.
  if (customId === MUSIC_BUTTONS.queue) {
    await showQueuePage(interaction, 0, false);
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
    default:
      return;
  }

  // The same buttons sit on the live panel and on a /nowplaying reply, which
  // are different cards. Redrawing with the wrong one turned the panel into a
  // now-playing card until the next refresh put it back.
  const snapshot = player.snapshot();
  const onPanel = isPanelMessage(interaction.guild.id, interaction.message.id);
  await interaction.editReply({
    embeds: [onPanel ? panelEmbed(snapshot) : nowPlayingEmbed(snapshot)],
    components: musicControls(snapshot),
  });
}

/**
 * Shows one page of the queue, with every track on it numbered and pickable.
 * Ephemeral, so browsing a 300 track playlist costs the channel nothing.
 */
async function showQueuePage(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  page: number,
  replaceExisting: boolean,
): Promise<void> {
  if (!interaction.guild) return;
  const player = playerManager.get(interaction.guild.id);
  if (!player) {
    await interaction.reply({
      embeds: [errorEmbed('Nothing is playing right now.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const snapshot = player.snapshot();
  const payload = {
    embeds: [queueEmbed(snapshot, page, QUEUE_PAGE_SIZE)],
    components: queueBrowser(snapshot, page),
  };

  // Paging edits the browser in place; opening it posts a new ephemeral one.
  if (replaceExisting) await interaction.update(payload);
  else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

/** Plays the numbers picked in the queue browser, in the order they were ticked. */
async function handleQueuePick(interaction: StringSelectMenuInteraction): Promise<void> {
  if (interaction.customId !== QUEUE_PICK_ID || !interaction.guild) return;

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
  const picked = interaction.values.map(Number).filter(Number.isInteger);
  const track = await player.playSelection(picked);
  if (!track) return;

  const snapshot = player.snapshot();
  await interaction.editReply({
    embeds: [queueEmbed(snapshot, 0, QUEUE_PAGE_SIZE)],
    components: queueBrowser(snapshot, 0),
  });
}

/**
 * Restarts the last thing this server played, after the bot has already left
 * the voice channel. The presser has to be in a voice channel themselves,
 * because there is no longer a connection to reuse.
 */
async function replayLastTrack(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) return;
  const [last] = historyRepository.recent(interaction.guild.id, 1);
  if (!last) {
    await interaction.reply({
      embeds: [errorEmbed('There is nothing to play again yet.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const voiceChannelId = member.voice.channelId;
  if (!voiceChannelId) {
    await interaction.reply({
      embeds: [errorEmbed('Join a voice channel first.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferUpdate();
  await play({
    guildId: interaction.guild.id,
    query: last.url,
    requester: { id: member.id, name: member.displayName },
    voiceChannelId,
    textChannelId: interaction.channelId,
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

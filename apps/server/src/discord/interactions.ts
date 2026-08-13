import {
  MessageFlags,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { SEEK_STEP_SECONDS, truncate, type LoopMode, type PlayerSnapshot } from '@phybot/shared';
import { AppError, toErrorMessage } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import {
  collectionsRepository,
  favouritesRepository,
  historyRepository,
  type FavouriteTrack,
} from '../db/repositories/misc.js';
import { settingsRepository } from '../db/repositories/settings.js';
import { handleEventInteraction, handleRolePanelInteraction } from '../features/index.js';
import { playerManager } from '../music/manager.js';
import { enqueueKnownTracks, play } from '../music/service.js';
import { suggestVoices } from './commands/assistant.js';
import { commandRegistry } from './commands/index.js';
import { MAX_FAVOURITES, toTrack } from './commands/favourites.js';
import { handleFluxButton, handleFluxSelect } from './commands/imagine.js';
import { buildLyricsEmbed } from './commands/lyrics.js';
import { executeSoundCommand, findSoundCommand } from './commands/soundboard.js';
import { hasPermission, permissionMessage, resolveMember } from './commands/helpers.js';
import {
  errorEmbed,
  musicControls,
  successEmbed,
  nowPlayingEmbed,
  panelEmbed,
  queueBrowser,
  queueEmbed,
  MUSIC_BUTTONS,
  QUEUE_BROWSE_PREFIX,
  QUEUE_PAGE_SIZE,
  QUEUE_PICK_ID,
  REPLAY_ONE_PREFIX,
  REPLAY_LIST_PREFIX,
  FAVOURITE_PREFIX,
  FAVOURITE_PAGE_PREFIX,
  FAVOURITE_PICK_ID,
  FAVOURITE_PLAY_ALL_ID,
  favouritesControls,
  favouritesEmbed,
} from './embeds.js';
import { KARAOKE_STOP_ID, stopKaraoke } from './karaoke.js';
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
      if (interaction.customId === FAVOURITE_PICK_ID) await handleFavouritePick(interaction);
      else if (interaction.customId.startsWith('music:')) await handleQueuePick(interaction);
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

  const member = await resolveMember(interaction, interaction.guild);
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

  const member = await resolveMember(interaction, interaction.guild);
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
  // Left on the card of a song that has already finished, so it names its own
  // play rather than replaying whatever is current.
  if (customId.startsWith(REPLAY_ONE_PREFIX)) {
    await replayStoredTrack(interaction, Number(customId.slice(REPLAY_ONE_PREFIX.length)));
    return;
  }
  // The favourites card: its own list, its own paging, and queueing from it.
  // All personal, so none of it needs the DJ role.
  if (customId === FAVOURITE_PLAY_ALL_ID) {
    await queueFavourites(
      interaction,
      favouritesRepository.list(interaction.user.id, MAX_FAVOURITES),
    );
    return;
  }
  if (customId.startsWith(FAVOURITE_PAGE_PREFIX)) {
    await showFavouritesPage(
      interaction,
      Number(customId.slice(FAVOURITE_PAGE_PREFIX.length)) || 0,
    );
    return;
  }
  if (customId === KARAOKE_STOP_ID) {
    await stopKaraoke(interaction.guild.id);
    await interaction.deferUpdate();
    return;
  }
  // Starring is personal and changes nothing for anyone else, so it needs no
  // player and no DJ role.
  if (customId.startsWith(FAVOURITE_PREFIX)) {
    await toggleFavourite(interaction, Number(customId.slice(FAVOURITE_PREFIX.length)));
    return;
  }
  // The card a finished playlist left behind queues the playlist again, not the
  // one song it happened to end on.
  if (customId.startsWith(REPLAY_LIST_PREFIX)) {
    await replayCollection(interaction, Number(customId.slice(REPLAY_LIST_PREFIX.length)));
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

  // Reading the queue or the words changes nothing, so neither needs the DJ role.
  if (customId === MUSIC_BUTTONS.queue) {
    await showQueuePage(interaction, 0, false);
    return;
  }
  if (customId === MUSIC_BUTTONS.lyrics) {
    await showLyrics(interaction, player.snapshot());
    return;
  }

  const member = await resolveMember(interaction, interaction.guild);
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

/**
 * Shows the words for the track playing now. Ephemeral, because a whole song
 * posted publicly would push the panel out of sight every time anyone asked.
 */
async function showLyrics(interaction: ButtonInteraction, snapshot: PlayerSnapshot): Promise<void> {
  if (!snapshot.current) {
    await interaction.reply({
      embeds: [errorEmbed('Nothing is playing right now.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Looking the words up takes a moment on the first play of a track.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const embed = await buildLyricsEmbed(snapshot);
  await respond(interaction, {
    embeds: [
      embed ??
        errorEmbed(
          `No lyrics found for **${truncate(snapshot.current.title, 80)}**.`,
          'Nothing found',
        ),
    ],
  });
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

  const member = await resolveMember(interaction, interaction.guild);
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
 * Queues one specific stored play, whichever card it was pressed from. Scrolling
 * back to a song from earlier in the evening and pressing its button plays that
 * song, not the current one.
 */
async function replayStoredTrack(interaction: ButtonInteraction, historyId: number): Promise<void> {
  if (!interaction.guild) return;

  const entry = Number.isInteger(historyId) ? historyRepository.byId(historyId) : null;
  if (!entry || entry.guildId !== interaction.guild.id) {
    await interaction.reply({
      embeds: [errorEmbed('That track is no longer available.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = await resolveMember(interaction, interaction.guild);
  const voiceChannelId =
    member.voice.channelId ?? playerManager.get(interaction.guild.id)?.channelId;
  if (!voiceChannelId) {
    await interaction.reply({
      embeds: [errorEmbed('Join a voice channel first.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await play({
    guildId: interaction.guild.id,
    query: entry.url,
    requester: { id: member.id, name: member.displayName },
    voiceChannelId,
    textChannelId: interaction.channelId,
  });
  await respond(interaction, {
    embeds: [successEmbed(`Queued **${truncate(entry.title, 80)}**.`)],
  });
}

/** Redraws the favourites card on another page. */
async function showFavouritesPage(interaction: ButtonInteraction, page: number): Promise<void> {
  const saved = favouritesRepository.list(interaction.user.id, MAX_FAVOURITES);
  await interaction.update({
    embeds: [favouritesEmbed(saved, page)],
    components: favouritesControls(saved, page),
  });
}

/**
 * Queues starred tracks, whether that is all of them or the few that were
 * picked. The presser has to be in a voice channel themselves, since the card
 * is usually opened long after the bot has left.
 */
async function queueFavourites(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  entries: FavouriteTrack[],
): Promise<void> {
  if (!interaction.guild) return;

  if (entries.length === 0) {
    await interaction.reply({
      embeds: [errorEmbed('Those tracks are no longer in your favourites.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = await resolveMember(interaction, interaction.guild);
  const voiceChannelId =
    member.voice.channelId ?? playerManager.get(interaction.guild.id)?.channelId;
  if (!voiceChannelId) {
    await interaction.reply({
      embeds: [errorEmbed('Join a voice channel first.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await enqueueKnownTracks({
    guildId: interaction.guild.id,
    tracks: entries.map((entry) => toTrack(entry, member.id, member.displayName)),
    voiceChannelId,
    textChannelId: interaction.channelId,
  });

  const first = entries[0];
  await respond(interaction, {
    embeds: [
      result.added === 0
        ? errorEmbed('The queue is full, so nothing could be added.')
        : successEmbed(
            result.added === 1 && first
              ? `Queued **${truncate(first.title, 80)}**.`
              : `Queued ${result.added} favourites.`,
          ),
    ],
  });
}

/** Queues just the favourites ticked on the card, in the order they were ticked. */
async function handleFavouritePick(interaction: StringSelectMenuInteraction): Promise<void> {
  const ids = interaction.values.map(Number);
  await queueFavourites(interaction, favouritesRepository.byIds(interaction.user.id, ids));
}

/** Stars or unstars the song a card is showing, for whoever pressed it. */
async function toggleFavourite(interaction: ButtonInteraction, historyId: number): Promise<void> {
  if (!interaction.guild) return;

  const entry = Number.isInteger(historyId) ? historyRepository.byId(historyId) : null;
  if (!entry || entry.guildId !== interaction.guild.id) {
    await interaction.reply({
      embeds: [errorEmbed('That track is no longer available.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // The stored play already carries everything a favourite needs, including the
  // real source - which a Track's narrower union would have forced a guess at.
  const added = favouritesRepository.toggle(interaction.user.id, interaction.guild.id, entry);

  await interaction.reply({
    embeds: [
      successEmbed(
        added
          ? `Starred **${truncate(entry.title, 80)}**. Queue them all with \`/favorites\`.`
          : `Removed **${truncate(entry.title, 80)}** from your favourites.`,
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Queues an imported playlist again from the card it left behind. The stored
 * request is re-resolved rather than replayed from stored tracks, so a playlist
 * that has changed since comes back as it is now.
 */
async function replayCollection(interaction: ButtonInteraction, id: number): Promise<void> {
  if (!interaction.guild) return;

  const collection = Number.isInteger(id) ? collectionsRepository.byId(id) : null;
  if (!collection || collection.guildId !== interaction.guild.id) {
    await interaction.reply({
      embeds: [errorEmbed('That playlist is no longer available.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = await resolveMember(interaction, interaction.guild);
  const voiceChannelId =
    member.voice.channelId ?? playerManager.get(interaction.guild.id)?.channelId;
  if (!voiceChannelId) {
    await interaction.reply({
      embeds: [errorEmbed('Join a voice channel first.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Re-importing a playlist can take a while, so the acknowledgement goes out
  // before the resolve rather than after it.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await play({
    guildId: interaction.guild.id,
    query: collection.url,
    requester: { id: member.id, name: member.displayName },
    voiceChannelId,
    textChannelId: interaction.channelId,
  });
  const name = truncate(result.playlistName ?? collection.title, 80);
  // A playlist that has since been emptied or made private resolves to nothing,
  // and reporting "queued 0 tracks" as a success would be misleading.
  await respond(interaction, {
    embeds:
      result.added === 0
        ? [errorEmbed(`Nothing in **${name}** could be played. It may have changed since.`)]
        : [
            successEmbed(
              `Queued **${name}** — ${result.added} track${result.added === 1 ? '' : 's'}.`,
            ),
          ],
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

  const member = await resolveMember(interaction, interaction.guild);
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

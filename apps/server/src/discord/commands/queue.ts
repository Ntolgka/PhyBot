import { SlashCommandBuilder } from 'discord.js';
import { LOOP_MODES, truncate, type LoopMode } from '@phybot/shared';
import { AppError } from '../../core/errors.js';
import { infoEmbed, queueEmbed, successEmbed } from '../embeds.js';
import { embedReply, respond } from '../reply.js';
import { assertSameVoiceChannel, requirePlayer } from './helpers.js';
import type { BotCommand } from './types.js';

const queueCommand: BotCommand = {
  category: 'Queue',
  usage: '/queue [page]',
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current queue')
    .addIntegerOption((option) =>
      option.setName('page').setDescription('Page number').setMinValue(1),
    ),
  async execute({ interaction, guild }) {
    const player = requirePlayer(guild.id);
    const page = (interaction.options.getInteger('page') ?? 1) - 1;
    await respond(interaction, { embeds: [queueEmbed(player.snapshot(), page)] });
  },
};

const removeCommand: BotCommand = {
  category: 'Queue',
  usage: '/remove <position>',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a track from the queue')
    .addIntegerOption((option) =>
      option
        .setName('position')
        .setDescription('Position in the queue, as shown by /queue')
        .setMinValue(1)
        .setRequired(true),
    ),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    const removed = player.removeTrackAt(interaction.options.getInteger('position', true) - 1);
    if (!removed) throw new AppError('not_found', 'There is no track at that position.', 404);
    await embedReply(interaction, successEmbed(`Removed **${truncate(removed.title, 80)}**.`));
  },
};

const clearCommand: BotCommand = {
  category: 'Queue',
  usage: '/clear',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Remove every queued track but keep playing the current one'),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    const removed = player.clearQueue();
    await embedReply(interaction, successEmbed(`Cleared ${removed} tracks from the queue.`));
  },
};

const moveCommand: BotCommand = {
  category: 'Queue',
  usage: '/move <from> <to>',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move a queued track to another position')
    .addIntegerOption((option) =>
      option.setName('from').setDescription('Current position').setMinValue(1).setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName('to').setDescription('New position').setMinValue(1).setRequired(true),
    ),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    const from = interaction.options.getInteger('from', true) - 1;
    const to = interaction.options.getInteger('to', true) - 1;
    if (!player.moveTrack(from, to)) {
      throw new AppError('not_found', 'There is no track at that position.', 404);
    }
    await embedReply(interaction, successEmbed(`Moved track ${from + 1} to position ${to + 1}.`));
  },
};

const jumpCommand: BotCommand = {
  category: 'Queue',
  usage: '/jump <position>',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('jump')
    .setDescription('Jump straight to a track in the queue')
    .addIntegerOption((option) =>
      option.setName('position').setDescription('Queue position').setMinValue(1).setRequired(true),
    ),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    await interaction.deferReply();
    const track = await player.jumpTo(interaction.options.getInteger('position', true) - 1);
    if (!track) throw new AppError('not_found', 'There is no track at that position.', 404);
    await respond(interaction, {
      embeds: [successEmbed(`Now playing **${truncate(track.title, 80)}**.`)],
    });
  },
};

const shuffleCommand: BotCommand = {
  category: 'Queue',
  usage: '/shuffle [random-order]',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Mix the queue, or keep picking tracks at random')
    .addBooleanOption((option) =>
      option
        .setName('random-order')
        .setDescription('Keep choosing the next track at random instead of mixing once'),
    ),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    const randomMode = interaction.options.getBoolean('random-order');

    if (randomMode !== null) {
      player.setShuffle(randomMode);
      await embedReply(
        interaction,
        successEmbed(
          randomMode
            ? 'Random order is on: the next track is picked at random.'
            : 'Random order is off: the queue plays in order.',
        ),
      );
      return;
    }

    const count = player.shuffleQueue();
    await embedReply(interaction, successEmbed(`Mixed ${count} tracks.`));
  },
};

const loopCommand: BotCommand = {
  category: 'Queue',
  usage: '/loop <off|track|queue>',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set the repeat mode')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('What to repeat')
        .setRequired(true)
        .addChoices(
          { name: 'Off', value: 'off' },
          { name: 'Current track', value: 'track' },
          { name: 'Whole queue', value: 'queue' },
        ),
    ),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    const mode = interaction.options.getString('mode', true) as LoopMode;
    if (!LOOP_MODES.includes(mode)) throw new AppError('bad_mode', 'Unknown loop mode.', 400);
    player.setLoop(mode);
    const labels: Record<LoopMode, string> = {
      off: 'Repeat is off.',
      track: 'Repeating the current track.',
      queue: 'Repeating the whole queue.',
    };
    await embedReply(interaction, successEmbed(labels[mode]));
  },
};

const autoplayCommand: BotCommand = {
  category: 'Queue',
  usage: '/autoplay [enabled]',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Keep playing related tracks when the queue runs out')
    .addBooleanOption((option) =>
      option.setName('enabled').setDescription('Turn autoplay on or off'),
    ),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    const enabled = interaction.options.getBoolean('enabled') ?? !player.autoplay;
    player.setAutoplay(enabled);
    await embedReply(interaction, successEmbed(enabled ? 'Autoplay is on.' : 'Autoplay is off.'));
  },
};

const cleanupCommand: BotCommand = {
  category: 'Queue',
  usage: '/dedupe',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('dedupe')
    .setDescription('Remove duplicate tracks from the queue'),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    const removed = player.dedupeQueue();
    await embedReply(
      interaction,
      removed > 0
        ? successEmbed(`Removed ${removed} duplicate tracks.`)
        : infoEmbed('There were no duplicates.'),
    );
  },
};

export const queueCommands: BotCommand[] = [
  queueCommand,
  removeCommand,
  clearCommand,
  moveCommand,
  jumpCommand,
  shuffleCommand,
  loopCommand,
  autoplayCommand,
  cleanupCommand,
];

import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { SEEK_STEP_SECONDS, formatDuration, truncate } from '@phybot/shared';
import { AppError } from '../../core/errors.js';
import { play } from '../../music/service.js';
import { playerManager } from '../../music/manager.js';
import { searchTracks } from '../../music/resolver.js';
import {
  addedEmbed,
  errorEmbed,
  infoEmbed,
  musicControls,
  nowPlayingEmbed,
  successEmbed,
} from '../embeds.js';
import { panelCoversChannel, postPanel } from '../panel.js';
import { embedReply, respond } from '../reply.js';
import {
  assertSameVoiceChannel,
  parseTimestamp,
  requirePlayer,
  requireVoiceChannel,
} from './helpers.js';
import type { BotCommand } from './types.js';

const playCommand: BotCommand = {
  category: 'Music',
  usage: '/play <song or link> [next] [shuffle]',
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song, playlist or link from YouTube, SoundCloud or Spotify')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Search words or a link (prefix with "sc:" to search SoundCloud)')
        .setRequired(true)
        .setMaxLength(2000),
    )
    .addBooleanOption((option) =>
      option.setName('next').setDescription('Put it at the front of the queue'),
    )
    .addBooleanOption((option) =>
      option.setName('shuffle').setDescription('Mix a playlist before queueing it'),
    ),
  async execute({ interaction, guild, member }) {
    const voiceChannel = requireVoiceChannel(member);
    // The panel posts a card with the track and every control the moment
    // playback starts, so a second public card here would only repeat it
    // without the buttons. The requester still gets their confirmation.
    const duplicate = panelCoversChannel(guild.id, interaction.channelId);
    await interaction.deferReply(duplicate ? { flags: MessageFlags.Ephemeral } : {});

    const result = await play({
      guildId: guild.id,
      query: interaction.options.getString('query', true),
      requester: { id: member.id, name: member.displayName },
      voiceChannelId: voiceChannel.id,
      textChannelId: interaction.channelId,
      next: interaction.options.getBoolean('next') ?? false,
      shuffle: interaction.options.getBoolean('shuffle') ?? false,
    });

    const embed = addedEmbed(result.tracks, result.playlistName, result.startedNow);
    if (result.rejected > 0) {
      embed.setFooter({ text: `${result.rejected} tracks were dropped because the queue is full` });
    } else if (result.truncated > 0) {
      embed.setFooter({ text: `Only the first ${result.tracks.length} tracks were imported` });
    } else if (result.partial) {
      embed.setFooter({
        text: `Spotify only shares the first ${result.tracks.length} tracks of a playlist publicly`,
      });
    }
    // When the panel covers this channel it carries the controls and this reply
    // is ephemeral. Otherwise this is the only card anyone will see, so it gets
    // the controls rather than being a dead confirmation.
    const snapshot = playerManager.get(guild.id)?.snapshot();
    await respond(interaction, {
      embeds: [embed],
      components: !duplicate && snapshot ? musicControls(snapshot) : [],
    });
  },
};

const searchCommand: BotCommand = {
  category: 'Music',
  usage: '/search <words>',
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search for a track and show the top results')
    .addStringOption((option) =>
      option.setName('query').setDescription('What to search for').setRequired(true),
    ),
  async execute({ interaction }) {
    await interaction.deferReply();
    const results = await searchTracks(interaction.options.getString('query', true), 8);
    if (results.length === 0) {
      await embedReply(interaction, infoEmbed('No results found.'));
      return;
    }
    const embed = infoEmbed(
      results
        .map(
          (result, index) =>
            `\`${index + 1}.\` [${truncate(result.title, 60)}](${result.url}) \`${formatDuration(result.duration, result.isLive)}\``,
        )
        .join('\n'),
      'Search results',
    ).setFooter({ text: 'Copy a link and use /play to queue it.' });
    await respond(interaction, { embeds: [embed] });
  },
};

const nowPlayingCommand: BotCommand = {
  category: 'Music',
  usage: '/nowplaying',
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show what is playing with playback controls'),
  async execute({ interaction, guild }) {
    const player = requirePlayer(guild.id);
    const snapshot = player.snapshot();
    await respond(interaction, {
      embeds: [nowPlayingEmbed(snapshot)],
      components: musicControls(snapshot),
    });
  },
};

const pauseCommand: BotCommand = {
  category: 'Music',
  usage: '/pause',
  permission: 'dj',
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause playback'),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    if (!player.pause()) throw new AppError('not_playing', 'Nothing is playing right now.', 409);
    await embedReply(interaction, successEmbed('Paused.'));
  },
};

const resumeCommand: BotCommand = {
  category: 'Music',
  usage: '/resume',
  permission: 'dj',
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume playback'),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    if (!player.resume()) throw new AppError('not_paused', 'Playback is not paused.', 409);
    await embedReply(interaction, successEmbed('Resumed.'));
  },
};

const skipCommand: BotCommand = {
  category: 'Music',
  usage: '/skip [count]',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip to the next track')
    .addIntegerOption((option) =>
      option
        .setName('count')
        .setDescription('How many tracks to skip')
        .setMinValue(1)
        .setMaxValue(50),
    ),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    await interaction.deferReply();
    const next = await player.skip(interaction.options.getInteger('count') ?? 1);
    await respond(interaction, {
      embeds: [
        next
          ? successEmbed(`Now playing **${truncate(next.title, 80)}**.`)
          : infoEmbed('Reached the end of the queue.'),
      ],
    });
  },
};

const previousCommand: BotCommand = {
  category: 'Music',
  usage: '/previous',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('previous')
    .setDescription('Go back to the previous track'),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    await interaction.deferReply();
    const track = await player.previous();
    if (!track) {
      await respond(interaction, { embeds: [infoEmbed('There is no previous track.')] });
      return;
    }
    await respond(interaction, {
      embeds: [successEmbed(`Playing **${truncate(track.title, 80)}** again.`)],
    });
  },
};

const replayCommand: BotCommand = {
  category: 'Music',
  usage: '/replay',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('replay')
    .setDescription('Play the current track again from the start'),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    await interaction.deferReply();
    const track = await player.restart();
    if (!track) throw new AppError('not_playing', 'Nothing is playing right now.', 409);
    await respond(interaction, {
      embeds: [successEmbed(`Restarted **${truncate(track.title, 80)}**.`)],
    });
  },
};

const stopCommand: BotCommand = {
  category: 'Music',
  usage: '/stop',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback and clear the queue'),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    player.stop(true);
    await embedReply(interaction, successEmbed('Stopped and cleared the queue.'));
  },
};

const seekCommand: BotCommand = {
  category: 'Music',
  usage: '/seek <position>',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Jump to a position in the current track')
    .addStringOption((option) =>
      option
        .setName('position')
        .setDescription('For example 90, 1:30 or 1:02:03')
        .setRequired(true),
    ),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    const seconds = parseTimestamp(interaction.options.getString('position', true));
    await interaction.deferReply();
    const position = await player.seek(seconds);
    await respond(interaction, {
      embeds: [successEmbed(`Jumped to \`${formatDuration(position)}\`.`)],
    });
  },
};

function seekStepCommand(name: 'forward' | 'rewind'): BotCommand {
  const forward = name === 'forward';
  return {
    category: 'Music',
    usage: `/${name} [seconds]`,
    permission: 'dj',
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(
        forward
          ? `Skip ahead (${SEEK_STEP_SECONDS} seconds by default)`
          : `Go back (${SEEK_STEP_SECONDS} seconds by default)`,
      )
      .addIntegerOption((option) =>
        option
          .setName('seconds')
          .setDescription('How many seconds')
          .setMinValue(1)
          .setMaxValue(600),
      ),
    async execute({ interaction, guild, member }) {
      const player = requirePlayer(guild.id);
      assertSameVoiceChannel(member, player);
      const step = interaction.options.getInteger('seconds') ?? SEEK_STEP_SECONDS;
      await interaction.deferReply();
      const position = await player.seekRelative(forward ? step : -step);
      await respond(interaction, {
        embeds: [
          successEmbed(
            `${forward ? 'Skipped ahead' : 'Went back'} ${step}s to \`${formatDuration(position)}\`.`,
          ),
        ],
      });
    },
  };
}

const volumeCommand: BotCommand = {
  category: 'Music',
  usage: '/volume [percent]',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Show or change the playback volume')
    .addIntegerOption((option) =>
      option
        .setName('percent')
        .setDescription('Volume from 0 to 200')
        .setMinValue(0)
        .setMaxValue(200),
    ),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    const percent = interaction.options.getInteger('percent');
    if (percent === null) {
      await embedReply(interaction, infoEmbed(`Volume is at **${player.volume}%**.`));
      return;
    }
    assertSameVoiceChannel(member, player);
    await embedReply(interaction, successEmbed(`Volume set to **${player.setVolume(percent)}%**.`));
  },
};

const joinCommand: BotCommand = {
  category: 'Music',
  usage: '/join',
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Bring the bot into your voice channel'),
  async execute({ interaction, guild, member }) {
    const channel = requireVoiceChannel(member);
    await interaction.deferReply();
    await playerManager.join(guild, channel, interaction.channelId);
    await respond(interaction, { embeds: [successEmbed(`Joined **${channel.name}**.`)] });
  },
};

const leaveCommand: BotCommand = {
  category: 'Music',
  usage: '/leave',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Disconnect the bot from the voice channel'),
  async execute({ interaction, guild, member }) {
    const player = requirePlayer(guild.id);
    assertSameVoiceChannel(member, player);
    playerManager.destroy(guild.id);
    await embedReply(interaction, successEmbed('Left the voice channel.'));
  },
};

const sourceCommand: BotCommand = {
  category: 'Music',
  usage: '/source',
  data: new SlashCommandBuilder()
    .setName('source')
    .setDescription('Show the link of the current track'),
  async execute({ interaction, guild }) {
    const player = requirePlayer(guild.id);
    const current = player.queue.current;
    if (!current) {
      await respond(interaction, {
        embeds: [errorEmbed('Nothing is playing right now.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await respond(interaction, { content: current.url });
  },
};

const panelCommand: BotCommand = {
  category: 'Music',
  usage: '/panel',
  permission: 'dj',
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post the live music panel with the queue and controls here'),
  async execute({ interaction, guild }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await postPanel(guild.id, interaction.channelId);
    await respond(interaction, {
      embeds: [
        successEmbed(
          'The music panel is now in this channel. It updates itself while music plays.',
        ),
      ],
    });
  },
};

export const musicCommands: BotCommand[] = [
  playCommand,
  panelCommand,
  searchCommand,
  nowPlayingCommand,
  pauseCommand,
  resumeCommand,
  skipCommand,
  previousCommand,
  replayCommand,
  stopCommand,
  seekCommand,
  seekStepCommand('forward'),
  seekStepCommand('rewind'),
  volumeCommand,
  joinCommand,
  leaveCommand,
  sourceCommand,
];

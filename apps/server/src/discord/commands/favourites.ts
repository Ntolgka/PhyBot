import { randomUUID } from 'node:crypto';
import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import {
  TRACK_SOURCES,
  formatDuration,
  truncate,
  type Track,
  type TrackSource,
} from '@phybot/shared';
import { favouritesRepository, type FavouriteTrack } from '../../db/repositories/misc.js';
import { enqueueKnownTracks } from '../../music/service.js';
import { baseEmbed, errorEmbed, infoEmbed } from '../embeds.js';
import { respond } from '../reply.js';
import { requireVoiceChannel } from './helpers.js';
import type { BotCommand } from './types.js';

/** How many favourites one command can queue at once. */
const MAX_QUEUED = 100;

/** Rebuilds a queue entry from a stored favourite. */
export function toTrack(
  entry: FavouriteTrack,
  requestedBy: string,
  requestedByName: string,
): Track {
  return {
    id: randomUUID(),
    title: entry.title,
    author: entry.author,
    url: entry.url,
    duration: entry.duration,
    isLive: false,
    thumbnail: entry.thumbnail,
    // The column is free text; anything unrecognised still plays by URL.
    source: (TRACK_SOURCES as readonly string[]).includes(entry.source)
      ? (entry.source as TrackSource)
      : 'radio',
    requestedBy,
    requestedByName,
    addedAt: Date.now(),
  };
}

const favouritesCommand: BotCommand = {
  category: 'Music',
  usage: '/favorites',
  data: new SlashCommandBuilder()
    .setName('favorites')
    .setDescription('Queue every track you have starred'),
  async execute({ interaction, guild, member }) {
    const saved = favouritesRepository.list(interaction.user.id, MAX_QUEUED);
    if (saved.length === 0) {
      await interaction.reply({
        embeds: [
          infoEmbed(
            'You have not starred anything yet. Press the Favourite button on a song card.',
            'No favourites',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const voiceChannel = requireVoiceChannel(member);
    await interaction.deferReply();

    const tracks = saved.map((entry) => toTrack(entry, member.id, member.displayName));
    const result = await enqueueKnownTracks({
      guildId: guild.id,
      tracks,
      voiceChannelId: voiceChannel.id,
      textChannelId: interaction.channelId,
    });

    if (result.added === 0) {
      await respond(interaction, {
        embeds: [errorEmbed('The queue is full, so nothing could be added.')],
      });
      return;
    }

    const embed = baseEmbed()
      .setAuthor({ name: result.startedNow ? 'Playing your favourites' : 'Added to queue' })
      .setTitle(`${result.added} favourite${result.added === 1 ? '' : 's'}`)
      .setDescription(
        saved
          .slice(0, 5)
          .map(
            (entry, index) =>
              `\`${index + 1}.\` [${truncate(entry.title, 60)}](${entry.url}) \`${formatDuration(entry.duration)}\``,
          )
          .join('\n') + (saved.length > 5 ? `\n_and ${saved.length - 5} more_` : ''),
      );
    const cover = saved.find((entry) => entry.thumbnail)?.thumbnail;
    if (cover) embed.setThumbnail(cover);

    await respond(interaction, { embeds: [embed] });
  },
};

export const favouritesCommands: BotCommand[] = [favouritesCommand];

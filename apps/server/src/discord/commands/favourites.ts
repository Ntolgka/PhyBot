import { randomUUID } from 'node:crypto';
import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { TRACK_SOURCES, type Track, type TrackSource } from '@phybot/shared';
import { favouritesRepository, type FavouriteTrack } from '../../db/repositories/misc.js';
import { favouritesControls, favouritesEmbed } from '../embeds.js';
import { respond } from '../reply.js';
import type { BotCommand } from './types.js';

/**
 * Everything a card can offer at once. Well past what anyone stars, and it caps
 * both the list that is drawn and the queue a single press can produce.
 */
export const MAX_FAVOURITES = 200;

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
    .setDescription('Show the tracks you have starred, to play all or just some'),
  async execute({ interaction }) {
    const saved = favouritesRepository.list(interaction.user.id, MAX_FAVOURITES);

    // Only the person who starred them can act on the card, so it is theirs to
    // see. A public list of one member's favourites is nobody else's business,
    // and the buttons would do nothing for them anyway.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await respond(interaction, {
      embeds: [favouritesEmbed(saved, 0)],
      components: favouritesControls(saved, 0),
    });
  },
};

export const favouritesCommands: BotCommand[] = [favouritesCommand];

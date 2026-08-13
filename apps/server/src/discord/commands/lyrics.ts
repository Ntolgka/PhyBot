import { MessageFlags, SlashCommandBuilder, type EmbedBuilder } from 'discord.js';
import { truncate, type PlayerSnapshot } from '@phybot/shared';
import { AppError } from '../../core/errors.js';
import { findLyrics, lineAt, type LyricLine } from '../../music/lyrics.js';
import { baseEmbed, errorEmbed, successEmbed } from '../embeds.js';
import { startKaraoke } from '../karaoke.js';
import { respond } from '../reply.js';
import { requirePlayer } from './helpers.js';
import type { BotCommand } from './types.js';

/** Discord refuses an embed description over this, so the words are trimmed. */
const MAX_DESCRIPTION = 4000;

/**
 * Renders the song with the line being sung in bold.
 *
 * The whole song is shown, since most fit comfortably; only when the words run
 * past what an embed can hold does it fall back to a window centred on the
 * current line, so the marked line is never the one that got cut off.
 */
export function renderLyrics(lines: LyricLine[], position: number): string {
  const current = lineAt(lines, position);
  const format = (line: LyricLine, index: number): string => {
    const text = truncate(line.text || '...', 180);
    return index === current ? `**${text}**` : text;
  };

  const full = lines.map(format).join('\n');
  if (full.length <= MAX_DESCRIPTION) return full;

  // Too long: keep the current line in the middle of what is shown.
  const start = Math.max(0, current - 12);
  return lines
    .slice(start, start + 40)
    .map((line, index) => format(line, start + index))
    .join('\n')
    .slice(0, MAX_DESCRIPTION);
}

const lyricsCommand: BotCommand = {
  category: 'Music',
  usage: '/lyrics',
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Show the words of the track that is playing'),
  async execute({ interaction, guild }) {
    const player = requirePlayer(guild.id);
    const snapshot = player.snapshot();
    const track = snapshot.current;
    if (!track) throw new AppError('not_playing', 'Nothing is playing right now.', 409);

    await interaction.deferReply();
    const lyrics = await findLyrics(track);
    if (!lyrics) {
      throw new AppError(
        'lyrics_not_found',
        `No lyrics found for **${truncate(track.title, 80)}**.`,
        404,
      );
    }

    const embed = baseEmbed()
      .setAuthor({ name: lyrics.synced ? 'Lyrics' : 'Lyrics (not timed)' })
      .setTitle(truncate(`${lyrics.artist} - ${lyrics.title}`, 100))
      .setDescription(
        lyrics.synced
          ? renderLyrics(lyrics.lines, snapshot.position)
          : truncate(lyrics.plain, MAX_DESCRIPTION),
      )
      .setFooter({
        text: lyrics.synced
          ? `${lyrics.source} - the dashboard follows along line by line`
          : lyrics.source,
      });

    if (track.url) embed.setURL(track.url);
    await respond(interaction, { embeds: [embed] });
  },
};

const karaokeCommand: BotCommand = {
  category: 'Music',
  usage: '/karaoke',
  data: new SlashCommandBuilder()
    .setName('karaoke')
    .setDescription('Follow the words line by line while the track plays'),
  async execute({ interaction, guild }) {
    const player = requirePlayer(guild.id);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const problem = await startKaraoke(guild.id, interaction.channelId, player.snapshot());
    await respond(interaction, {
      embeds: [
        problem
          ? errorEmbed(problem)
          : successEmbed('Following along. Press Stop karaoke when you have had enough.'),
      ],
    });
  },
};

export const lyricsCommands: BotCommand[] = [lyricsCommand, karaokeCommand];

/** Builds the same lyrics card the command produces, for the panel button. */
export async function buildLyricsEmbed(snapshot: PlayerSnapshot): Promise<EmbedBuilder | null> {
  const track = snapshot.current;
  if (!track) return null;
  const lyrics = await findLyrics(track);
  if (!lyrics) return null;

  const embed = baseEmbed()
    .setAuthor({ name: lyrics.synced ? 'Lyrics' : 'Lyrics (not timed)' })
    .setTitle(truncate(`${lyrics.artist} - ${lyrics.title}`, 100))
    .setDescription(
      lyrics.synced
        ? renderLyrics(lyrics.lines, snapshot.position)
        : truncate(lyrics.plain, MAX_DESCRIPTION),
    )
    .setFooter({ text: lyrics.source });
  if (track.url) embed.setURL(track.url);
  return embed;
}

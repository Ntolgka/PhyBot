import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type APIEmbedField,
} from 'discord.js';
import type { PlayerSnapshot, Track } from '@phybot/shared';
import { SEEK_STEP_SECONDS, formatDuration, progressBar, truncate } from '@phybot/shared';

export const COLORS = {
  brand: 0x7c5cff,
  success: 0x3ba55d,
  warning: 0xfaa61a,
  danger: 0xed4245,
  muted: 0x2b2d31,
} as const;

const SOURCE_LABELS: Record<Track['source'], string> = {
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  spotify: 'Spotify',
  radio: 'Stream',
  file: 'File',
};

/** Discord's hard limit on an embed description. */
const MAX_EMBED_DESCRIPTION = 4096;

export function baseEmbed(): EmbedBuilder {
  return new EmbedBuilder().setColor(COLORS.brand);
}

export function successEmbed(message: string, title?: string): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLORS.success).setDescription(message);
  if (title) embed.setTitle(title);
  return embed;
}

export function errorEmbed(message: string, title = 'Something went wrong'): EmbedBuilder {
  return new EmbedBuilder().setColor(COLORS.danger).setTitle(title).setDescription(message);
}

export function infoEmbed(message: string, title?: string): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLORS.brand).setDescription(message);
  if (title) embed.setTitle(title);
  return embed;
}

export function trackLine(track: Track, index?: number): string {
  const prefix = index === undefined ? '' : `\`${index + 1}.\` `;
  return `${prefix}[${truncate(track.title, 60)}](${track.url}) \`${formatDuration(track.duration, track.isLive)}\``;
}

export function nowPlayingEmbed(snapshot: PlayerSnapshot): EmbedBuilder {
  const track = snapshot.current;
  if (!track) {
    return infoEmbed('The queue is empty. Add something with `/play`.', 'Nothing is playing');
  }

  const bar = track.isLive
    ? 'Live stream'
    : `${formatDuration(snapshot.position)} ${progressBar(snapshot.position, track.duration)} ${formatDuration(track.duration)}`;

  const fields: APIEmbedField[] = [
    { name: 'Requested by', value: track.requestedByName || 'Unknown', inline: true },
    { name: 'Source', value: SOURCE_LABELS[track.source], inline: true },
    { name: 'Volume', value: `${snapshot.volume}%`, inline: true },
  ];
  if (snapshot.queue.length > 0) {
    fields.push({
      name: 'Up next',
      value: snapshot.queue
        .slice(0, 3)
        .map((item, index) => trackLine(item, index))
        .join('\n'),
    });
  }

  const embed = baseEmbed()
    .setAuthor({ name: snapshot.status === 'paused' ? 'Paused' : 'Now playing' })
    .setTitle(truncate(track.title, 100))
    .setURL(track.url)
    .setDescription(`${track.author ? `${truncate(track.author, 60)}\n` : ''}\`${bar}\``)
    .addFields(fields)
    .setFooter({
      text: [
        `${snapshot.queue.length} in queue`,
        snapshot.loop !== 'off' ? `Loop: ${snapshot.loop}` : null,
        snapshot.shuffle ? 'Shuffle on' : null,
        snapshot.autoplay ? 'Autoplay on' : null,
      ]
        .filter(Boolean)
        .join(' • '),
    });

  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}

export function queueEmbed(snapshot: PlayerSnapshot, page = 0, pageSize = 10): EmbedBuilder {
  const pages = Math.max(1, Math.ceil(snapshot.queue.length / pageSize));
  const current = Math.min(Math.max(page, 0), pages - 1);
  const slice = snapshot.queue.slice(current * pageSize, current * pageSize + pageSize);

  const embed = baseEmbed().setTitle(`Queue for ${snapshot.guildName}`);
  const lines: string[] = [];
  if (snapshot.current) {
    lines.push(`**Now playing**\n${trackLine(snapshot.current)}\n`);
  }
  const entries =
    slice.length > 0
      ? slice.map((track, index) => trackLine(track, current * pageSize + index))
      : ['_Nothing queued._'];

  // Discord rejects the whole message over 4096 characters. A full page of long
  // titles and long source URLs lands near 3600, so lines are dropped from the
  // end rather than risking a rejected edit.
  const budget = MAX_EMBED_DESCRIPTION - lines.join('\n').length - 40;
  let used = 0;
  const shown: string[] = [];
  for (const entry of entries) {
    if (used + entry.length + 1 > budget) break;
    shown.push(entry);
    used += entry.length + 1;
  }
  if (shown.length < entries.length) {
    shown.push(`_and ${entries.length - shown.length} more on this page_`);
  }

  lines.push(shown.join('\n'));
  embed.setDescription(lines.join('\n'));

  const total = snapshot.queueDuration;
  embed.setFooter({
    text: `Page ${current + 1}/${pages} • ${snapshot.queue.length} tracks • ${
      total < 0 ? 'includes a live stream' : formatDuration(total)
    } total`,
  });
  return embed;
}

export function addedEmbed(
  tracks: Track[],
  playlistName: string | null,
  startedNow: boolean,
): EmbedBuilder {
  const first = tracks[0];
  if (playlistName || tracks.length > 1) {
    const embed = baseEmbed()
      .setAuthor({ name: startedNow ? 'Playing playlist' : 'Added to queue' })
      .setTitle(truncate(playlistName ?? `${tracks.length} tracks`, 100))
      .setDescription(
        tracks
          .slice(0, 5)
          .map((track, index) => trackLine(track, index))
          .join('\n') + (tracks.length > 5 ? `\n_and ${tracks.length - 5} more_` : ''),
      );
    if (first?.thumbnail) embed.setThumbnail(first.thumbnail);
    return embed;
  }

  const embed = baseEmbed()
    .setAuthor({ name: startedNow ? 'Playing now' : 'Added to queue' })
    .setTitle(truncate(first?.title ?? 'Track', 100))
    .setDescription(
      first ? `${first.author}\n\`${formatDuration(first.duration, first.isLive)}\`` : '',
    );
  if (first?.url) embed.setURL(first.url);
  if (first?.thumbnail) embed.setThumbnail(first.thumbnail);
  return embed;
}

/**
 * Live panel kept in the music channel: what is playing, the queue and the
 * controls, all in the one message the music channel keeps at the bottom.
 */
export function panelEmbed(snapshot: PlayerSnapshot): EmbedBuilder {
  const track = snapshot.current;
  if (!track) {
    // Naming the last track is what makes the Play again button meaningful;
    // without it the button offers to replay something nobody can see.
    const last = snapshot.history[0];
    const idle = baseEmbed()
      .setAuthor({ name: 'Music' })
      .setTitle(last ? truncate(last.title, 100) : 'Nothing is playing')
      .setDescription(
        last
          ? [
              last.author ? `**${truncate(last.author, 60)}**` : null,
              'Finished playing. Press Play again to hear it once more, or use `/play`.',
            ]
              .filter(Boolean)
              .join('\n')
          : 'Use `/play` or the dashboard to start the music.',
      )
      .setFooter({ text: snapshot.guildName });
    if (last?.url) idle.setURL(last.url);
    if (last?.thumbnail) idle.setThumbnail(last.thumbnail);
    return idle;
  }

  const progress = track.isLive
    ? '`LIVE`'
    : `\`${formatDuration(snapshot.position)}\` ${progressBar(snapshot.position, track.duration, 22)} \`${formatDuration(track.duration)}\``;

  const embed = baseEmbed()
    .setAuthor({ name: snapshot.status === 'paused' ? 'Paused' : 'Now playing' })
    .setTitle(truncate(track.title, 100))
    .setURL(track.url)
    .setDescription(
      [track.author ? `**${truncate(track.author, 60)}**` : null, progress]
        .filter(Boolean)
        .join('\n'),
    )
    .addFields({
      name: 'Requested by',
      value: track.requestedByName || 'Unknown',
      inline: true,
    });

  embed.addFields(
    { name: 'Source', value: SOURCE_LABELS[track.source], inline: true },
    { name: 'Volume', value: `${snapshot.volume}%`, inline: true },
  );

  const upcoming = snapshot.queue.slice(0, 10);
  if (upcoming.length > 0) {
    const remaining = snapshot.queue.length - upcoming.length;
    const total =
      snapshot.queueDuration < 0
        ? 'includes a live stream'
        : formatDuration(snapshot.queueDuration);
    embed.addFields({
      name: `Queue (${snapshot.queue.length} • ${total})`,
      value: `${upcoming.map((item, index) => trackLine(item, index)).join('\n')}${
        remaining > 0 ? `\n_and ${remaining} more_` : ''
      }`,
    });
  } else {
    embed.addFields({
      name: 'Queue',
      value: snapshot.autoplay
        ? '_Empty. Autoplay will keep similar music going._'
        : '_Empty. Add something with `/play`._',
    });
  }

  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  embed
    .setFooter({
      text: [
        snapshot.loop !== 'off' ? `Loop: ${snapshot.loop}` : null,
        snapshot.shuffle ? 'Random order' : null,
        snapshot.autoplay ? 'Autoplay on' : null,
      ]
        .filter(Boolean)
        .join(' • '),
    })
    .setTimestamp(snapshot.updatedAt);
  return embed;
}

/** Button ids handled by discord/interactions.ts. */
export const MUSIC_BUTTONS = {
  previous: 'music:previous',
  rewind: 'music:rewind',
  toggle: 'music:toggle',
  forward: 'music:forward',
  skip: 'music:skip',
  stop: 'music:stop',
  loop: 'music:loop',
  shuffle: 'music:shuffle',
  replay: 'music:replay',
  queue: 'music:queue',
  lyrics: 'music:lyrics',
  autoplay: 'music:autoplay',
} as const;

export const REPLAY_ONE_PREFIX = 'music:replayone:';
export const REPLAY_LIST_PREFIX = 'music:replaylist:';

/**
 * What a card's Play again should queue. A playlist keeps one card for the
 * whole import, so its button queues the playlist again; anything else is a
 * single song and replays just that song.
 */
export interface CardTarget {
  historyId?: number | undefined;
  collectionId?: number | undefined;
}

/** The Play again button for a card, bound to whatever that card represents. */
function replayButton(target: CardTarget): ButtonBuilder {
  const button = new ButtonBuilder().setStyle(ButtonStyle.Secondary).setEmoji('🔂');
  if (target.collectionId !== undefined) {
    return button
      .setCustomId(`${REPLAY_LIST_PREFIX}${target.collectionId}`)
      .setLabel('Play playlist again');
  }
  if (target.historyId !== undefined) {
    return button.setCustomId(`${REPLAY_ONE_PREFIX}${target.historyId}`).setLabel('Play again');
  }
  return button.setCustomId(MUSIC_BUTTONS.replay).setLabel('Play again');
}

/**
 * The single button left on a card once it has finished, bound to that exact
 * play so scrolling back and pressing it replays that song, or that playlist,
 * rather than whatever happens to be current.
 */
export function replayControls(target: CardTarget): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(replayButton(target))];
}

/** Tracks per page in the queue browser; also Discord's select menu maximum. */
export const QUEUE_PAGE_SIZE = 25;

export const QUEUE_BROWSE_PREFIX = 'music:qpage:';
export const QUEUE_PICK_ID = 'music:qpick';

/**
 * The queue browser: the numbered list, a picker to play any of those numbers,
 * and page buttons. Lives in an ephemeral message so a long playlist does not
 * fill the channel.
 */
export function queueBrowser(
  snapshot: PlayerSnapshot,
  page: number,
): (ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>)[] {
  const pages = Math.max(1, Math.ceil(snapshot.queue.length / QUEUE_PAGE_SIZE));
  const current = Math.min(Math.max(page, 0), pages - 1);
  const start = current * QUEUE_PAGE_SIZE;
  const slice = snapshot.queue.slice(start, start + QUEUE_PAGE_SIZE);

  const rows: (ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>)[] = [];

  if (slice.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(QUEUE_PICK_ID)
          .setPlaceholder('Pick numbers to play now')
          // Several at once, played in the order they were ticked.
          .setMinValues(1)
          .setMaxValues(slice.length)
          .addOptions(
            slice.map((track, index) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(truncate(`${start + index + 1}. ${track.title}`, 100))
                .setDescription(truncate(track.author || 'Unknown artist', 100))
                .setValue(String(start + index)),
            ),
          ),
      ),
    );
  }

  if (pages > 1) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${QUEUE_BROWSE_PREFIX}${current - 1}`)
          .setEmoji('◀')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current === 0),
        new ButtonBuilder()
          .setCustomId(`${QUEUE_BROWSE_PREFIX}${current}`)
          .setLabel(`${current + 1}/${pages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`${QUEUE_BROWSE_PREFIX}${current + 1}`)
          .setEmoji('▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current >= pages - 1),
      ),
    );
  }

  return rows;
}

export function musicControls(
  snapshot: PlayerSnapshot,
  /** What this card represents, so its button replays that and not the newest. */
  target: CardTarget = {},
): ActionRowBuilder<ButtonBuilder>[] {
  const disabled = snapshot.current === null;

  // With nothing playing there is only one useful thing to press, and a row of
  // greyed out transport buttons is just noise at the bottom of the channel.
  if (disabled) {
    // Bound to this card's own song or playlist where it is known. The generic
    // button replays whatever ran most recently, which is the wrong thing as
    // soon as the card has been scrolled past, and it greys itself out on an
    // empty history - the two ways "Play again" on an older card failed to do
    // what it says.
    const bound = target.collectionId !== undefined || target.historyId !== undefined;
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        replayButton(target).setDisabled(!bound && snapshot.history.length === 0),
      ),
    ];
  }
  const primary = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTONS.previous)
      .setEmoji('⏮')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTONS.rewind)
      .setLabel(`-${SEEK_STEP_SECONDS}s`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || snapshot.current?.isLive === true),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTONS.toggle)
      .setEmoji(snapshot.status === 'playing' ? '⏸' : '▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTONS.forward)
      .setLabel(`+${SEEK_STEP_SECONDS}s`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || snapshot.current?.isLive === true),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTONS.skip)
      .setEmoji('⏭')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );

  const secondary = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTONS.replay)
      .setEmoji('🔂')
      .setLabel('Play again')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTONS.loop)
      .setLabel(`Loop: ${snapshot.loop}`)
      .setStyle(snapshot.loop === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTONS.shuffle)
      .setEmoji('🔀')
      .setLabel('Mix queue')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(snapshot.queue.length < 2),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTONS.autoplay)
      .setEmoji('📻')
      .setLabel(snapshot.autoplay ? 'Autoplay on' : 'Autoplay off')
      .setStyle(snapshot.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTONS.stop)
      .setEmoji('⏹')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );

  // The whole playlist never fits in the panel, so it gets its own button
  // rather than a truncated list nobody can act on.
  const browse = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTONS.queue)
      .setEmoji('📜')
      .setLabel(snapshot.queue.length > 0 ? `Queue (${snapshot.queue.length})` : 'Queue is empty')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(snapshot.queue.length === 0),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTONS.lyrics)
      .setEmoji('🎤')
      .setLabel('Lyrics')
      .setStyle(ButtonStyle.Secondary),
  );

  return [primary, secondary, browse];
}

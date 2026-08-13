import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Message } from 'discord.js';
import { truncate, type PlayerSnapshot } from '@phybot/shared';
import { toErrorMessage } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import { playerManager } from '../music/manager.js';
import { findLyrics, lineAt, type LyricLine } from '../music/lyrics.js';
import { baseEmbed } from './embeds.js';
import { tryGetClient } from './client.js';

const log = createLogger('karaoke');

export const KARAOKE_STOP_ID = 'music:karaoke:stop';

/** Lines kept behind and ahead of the one being sung. */
const LINES_BEHIND = 2;
const LINES_AHEAD = 4;

/**
 * How often the position is read. Lines are rarely closer together than this,
 * and the message is only edited when the line actually changes.
 */
const TICK_MS = 1500;

/**
 * Floor between edits. Discord shares an edit budget across a channel, and the
 * music panel is editing in the same one, so a fast passage must not turn into
 * an edit every tick.
 */
const MIN_EDIT_MS = 2500;

interface Session {
  channelId: string;
  messageId: string;
  trackUrl: string;
  lines: LyricLine[];
  timer: NodeJS.Timeout;
  lastLine: number;
  lastEditAt: number;
}

const sessions = new Map<string, Session>();

/**
 * The words around the one being sung.
 *
 * A window rather than the whole song: the point is to follow along, and a full
 * embed of text redrawn every few seconds is both unreadable and a much larger
 * message to push through the edit budget.
 */
export function renderKaraoke(lines: LyricLine[], current: number): string {
  if (lines.length === 0) return '_No words for this one._';

  const start = Math.max(0, current - LINES_BEHIND);
  const shown = lines.slice(start, Math.max(current, 0) + LINES_AHEAD + 1);

  const rendered = shown.map((line, offset) => {
    const index = start + offset;
    const text = truncate(line.text || '...', 150);
    return index === current ? `### ${text}` : `-# ${text}`;
  });

  // Before the first line there is nothing to highlight, so the intro is
  // named rather than leaving the message looking broken.
  if (current < 0) rendered.unshift('-# _(intro)_');
  return rendered.join('\n');
}

function controls(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(KARAOKE_STOP_ID)
        .setEmoji('⏹')
        .setLabel('Stop karaoke')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildEmbed(title: string, body: string, done = false): ReturnType<typeof baseEmbed> {
  return baseEmbed()
    .setAuthor({ name: done ? 'Karaoke - finished' : 'Karaoke' })
    .setTitle(truncate(title, 100))
    .setDescription(body);
}

async function editSession(guildId: string, session: Session, done = false): Promise<boolean> {
  const client = tryGetClient();
  if (!client?.isReady()) return false;
  try {
    const channel = await client.channels.fetch(session.channelId);
    if (!channel?.isTextBased()) return false;
    const message = (await channel.messages.fetch(session.messageId)) as Message;
    await message.edit({
      embeds: [
        buildEmbed(
          message.embeds[0]?.title ?? 'Karaoke',
          renderKaraoke(session.lines, session.lastLine),
          done,
        ),
      ],
      components: done ? [] : controls(),
    });
    return true;
  } catch (error) {
    log.debug({ guildId }, `Karaoke message could not be edited: ${toErrorMessage(error)}`);
    return false;
  }
}

/** Ends the feed, leaving the last words on screen without the button. */
export async function stopKaraoke(guildId: string): Promise<void> {
  const session = sessions.get(guildId);
  if (!session) return;
  sessions.delete(guildId);
  clearInterval(session.timer);
  await editSession(guildId, session, true);
}

export function isKaraokeRunning(guildId: string): boolean {
  return sessions.has(guildId);
}

/**
 * Starts following the current track line by line in the given channel.
 *
 * Returns why it could not start, or null once running.
 */
export async function startKaraoke(
  guildId: string,
  channelId: string,
  snapshot: PlayerSnapshot,
): Promise<string | null> {
  const track = snapshot.current;
  if (!track) return 'Nothing is playing right now.';

  const lyrics = await findLyrics(track);
  if (!lyrics) return `No lyrics found for **${truncate(track.title, 80)}**.`;
  if (!lyrics.synced || lyrics.lines.length === 0) {
    return `Only untimed lyrics exist for **${truncate(track.title, 80)}**, so there is nothing to follow. Try \`/lyrics\`.`;
  }

  await stopKaraoke(guildId);

  const client = tryGetClient();
  if (!client?.isReady()) return 'The bot is not connected yet.';
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased() || !channel.isSendable()) {
    return 'The words cannot be posted in this channel.';
  }

  const current = lineAt(lyrics.lines, snapshot.position);
  const message = await channel.send({
    embeds: [
      buildEmbed(`${lyrics.artist} - ${lyrics.title}`, renderKaraoke(lyrics.lines, current)),
    ],
    components: controls(),
  });

  const session: Session = {
    channelId,
    messageId: message.id,
    trackUrl: track.url,
    lines: lyrics.lines,
    lastLine: current,
    lastEditAt: Date.now(),
    timer: setInterval(() => void tick(guildId), TICK_MS),
  };
  sessions.set(guildId, session);
  return null;
}

async function tick(guildId: string): Promise<void> {
  const session = sessions.get(guildId);
  if (!session) return;

  const player = playerManager.get(guildId);
  const snapshot = player?.snapshot();
  // The song it was following is over, or something else is playing now.
  if (!snapshot?.current || snapshot.current.url !== session.trackUrl) {
    await stopKaraoke(guildId);
    return;
  }
  if (snapshot.status === 'paused') return;

  const current = lineAt(session.lines, snapshot.position);
  if (current === session.lastLine) return;
  if (Date.now() - session.lastEditAt < MIN_EDIT_MS) return;

  session.lastLine = current;
  session.lastEditAt = Date.now();
  const ok = await editSession(guildId, session);
  // The message was deleted, or the bot lost access; stop rather than spend
  // the rest of the song failing every tick.
  if (!ok) await stopKaraoke(guildId);
}

/** Stops any feed whose song has ended or whose player has gone away. */
export function registerKaraoke(): void {
  playerManager.on('trackEnd', ({ guildId }) => void stopKaraoke(guildId));
  playerManager.on('queueEnd', ({ guildId }) => void stopKaraoke(guildId));
  playerManager.on('destroyed', ({ guildId }) => void stopKaraoke(guildId));
}

import { randomUUID } from 'node:crypto';
import { ChannelType, PermissionsBitField, type Message, type SendableChannels } from 'discord.js';
import type { PlayerSnapshot, Track, TrackSource } from '@phybot/shared';
import { TRACK_SOURCES } from '@phybot/shared';
import { bus } from '../core/bus.js';
import { createLogger } from '../core/logger.js';
import { toErrorMessage } from '../core/errors.js';
import { historyRepository } from '../db/repositories/misc.js';
import { stateRepository } from '../db/repositories/state.js';
import { settingsRepository } from '../db/repositories/settings.js';
import { playerManager } from '../music/manager.js';
import { musicControls, panelEmbed, replayControls, type CardTarget } from './embeds.js';
import { tryGetClient } from './client.js';

const log = createLogger('panel');

/**
 * The music channel keeps one message that always shows what is playing, the
 * queue and the controls. Playback changes edit it in place; a new track posts
 * a fresh one at the bottom and removes the previous, as does chatter pushing
 * it out of sight, so the controls are always reachable without scrolling.
 */
const PANEL_STATE_KEY = 'music:panels';
/**
 * Playback emits a tick every few seconds; editing that often would waste
 * rate limit budget, so routine refreshes are coalesced into this window while
 * track changes and button presses refresh immediately.
 */
const EDIT_INTERVAL_MS = 15_000;
/** Messages from other people before the panel is posted again at the bottom. */
const REPOST_AFTER_MESSAGES = 6;

interface PanelLocation {
  channelId: string;
  messageId: string;
  /** The play this card is showing, so it can be left behind as replayable. */
  historyId?: number;
  /** Set when the card belongs to a playlist import, which it replays whole. */
  collectionId?: number;
}

type PanelState = Record<string, PanelLocation>;

interface PendingUpdate {
  timer: NodeJS.Timeout | null;
  lastEditAt: number;
  running: boolean;
}

const pending = new Map<string, PendingUpdate>();
/** Guilds whose next refresh must post a new message instead of editing. */
const repostWanted = new Set<string>();
const messagesSincePost = new Map<string, number>();

function readState(): PanelState {
  return stateRepository.get<PanelState>(PANEL_STATE_KEY, {});
}

function rememberPanel(guildId: string, location: PanelLocation | null): void {
  const state = readState();
  if (location) state[guildId] = location;
  else delete state[guildId];
  stateRepository.set(PANEL_STATE_KEY, state);
}

/** The channel a guild's panel belongs in, or null when none is configured. */
function panelChannelId(guildId: string): string | null {
  const settings = settingsRepository.get(guildId);
  if (!settings.announceNowPlaying) return null;
  return settings.musicTextChannelId ?? playerManager.get(guildId)?.textChannelId ?? null;
}

/**
 * True when the live panel already posts into this channel, which means a
 * command replying there with its own now-playing card would say the same thing
 * twice - once with the controls and once without.
 */
export function panelCoversChannel(guildId: string, channelId: string): boolean {
  // A channel the panel has failed to post in covers nothing. Without this a
  // command hides its own reply behind a card that never arrives, which leaves
  // the requester with an ephemeral confirmation and no controls anywhere.
  if (reportedChannels.has(channelId)) return false;
  return panelChannelId(guildId) === channelId;
}

/** True when this message is the guild's live panel rather than a command reply. */
export function isPanelMessage(guildId: string, messageId: string): boolean {
  return readState()[guildId]?.messageId === messageId;
}

async function resolveChannel(channelId: string): Promise<SendableChannels | null> {
  const client = tryGetClient();
  if (!client?.isReady()) return null;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type === ChannelType.DM || !channel.isSendable()) return null;
    return channel;
  } catch {
    return null;
  }
}

/** Channels already reported as unusable, so one broken panel logs once. */
const reportedChannels = new Set<string>();

/**
 * Why the panel cannot be posted, in terms the server owner can act on.
 *
 * A panel that cannot post used to fail at debug level, which left the bot
 * looking like it had simply stopped announcing tracks - and worse, /play still
 * hid its own reply because it believed the panel was covering the channel. The
 * extra lookups only run once posting has already failed.
 */
async function explainChannelFailure(channelId: string): Promise<string> {
  const client = tryGetClient();
  if (!client?.isReady()) return 'the bot is not connected to Discord yet';

  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch {
    return 'the channel could not be read; it may have been deleted, or the bot cannot see it';
  }
  if (!channel) return 'the channel no longer exists';
  if (channel.type === ChannelType.DM) return 'a direct message cannot hold the panel';
  if (!channel.isTextBased() || !('guild' in channel)) return 'that channel cannot hold messages';

  const me = channel.guild.members.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  const missing = [
    permissions?.has(PermissionsBitField.Flags.ViewChannel) ? null : 'View Channel',
    permissions?.has(PermissionsBitField.Flags.SendMessages) ? null : 'Send Messages',
    permissions?.has(PermissionsBitField.Flags.EmbedLinks) ? null : 'Embed Links',
  ].filter(Boolean);
  return missing.length > 0
    ? `the bot is missing ${missing.join(', ')} in that channel`
    : 'the channel is not writable';
}

/** Reports a channel the panel cannot use, once, until it works again. */
async function reportChannel(guildId: string, channelId: string): Promise<void> {
  if (reportedChannels.has(channelId)) return;
  reportedChannels.add(channelId);
  log.warn(
    { guildId, channelId },
    `The music panel cannot be posted: ${await explainChannelFailure(channelId)}`,
  );
}

function snapshotFor(guildId: string): PlayerSnapshot | null {
  const player = playerManager.get(guildId);
  return player ? player.snapshot() : null;
}

/** The last track this server played, read back from storage. */
function storedHistory(guildId: string): Track[] {
  return historyRepository.recent(guildId, 1).map((entry): Track => ({
    id: randomUUID(),
    title: entry.title,
    author: entry.author,
    url: entry.url,
    duration: entry.duration,
    isLive: false,
    thumbnail: null,
    // History stores the source as free text; only the label matters here.
    source: (TRACK_SOURCES as readonly string[]).includes(entry.source)
      ? (entry.source as TrackSource)
      : 'radio',
    requestedBy: '',
    requestedByName: entry.requestedBy,
    addedAt: entry.playedAt,
  }));
}

function idleSnapshot(guildId: string): PlayerSnapshot {
  const client = tryGetClient();
  const guild = client?.guilds.cache.get(guildId);
  return {
    guildId,
    guildName: guild?.name ?? 'this server',
    status: 'idle',
    current: null,
    position: 0,
    queue: [],
    history: storedHistory(guildId),
    volume: settingsRepository.get(guildId).defaultVolume,
    loop: 'off',
    shuffle: false,
    autoplay: false,
    voiceChannelId: null,
    voiceChannelName: null,
    textChannelId: null,
    queueDuration: 0,
    updatedAt: Date.now(),
  };
}

/**
 * Fills in the last played track when the live player cannot supply one.
 *
 * A connection opened purely to speak - an arrival announcement, an assistant
 * reply - creates a brand new player whose in-memory history is empty. Reading
 * that snapshot straight made the panel forget the song it had been offering to
 * replay and greyed the button out, some minutes after playback ended.
 */
function withStoredHistory(guildId: string, snapshot: PlayerSnapshot): PlayerSnapshot {
  if (snapshot.current || snapshot.history.length > 0) return snapshot;
  return { ...snapshot, history: storedHistory(guildId) };
}

async function writePanel(guildId: string): Promise<void> {
  const channelId = panelChannelId(guildId);
  if (!channelId) {
    // The panel was switched off or lost its channel; clean up the old message.
    const stale = readState()[guildId];
    if (stale) {
      await deleteMessage(stale);
      rememberPanel(guildId, null);
    }
    return;
  }

  const live = snapshotFor(guildId);
  const snapshot = live ? withStoredHistory(guildId, live) : idleSnapshot(guildId);

  const existing = readState()[guildId];
  // What this card stands for. While something is playing that is the live
  // track, or the playlist it arrived with; once playback stops the card keeps
  // whatever it last showed, so its Play again still points at its own song
  // rather than at whatever the server played most recently.
  const target: CardTarget = snapshot.current
    ? {
        historyId: currentHistoryId(guildId, snapshot),
        collectionId: snapshot.current.collectionId,
      }
    : { historyId: existing?.historyId, collectionId: existing?.collectionId };

  const payload = {
    embeds: [panelEmbed(snapshot)],
    components: musicControls(snapshot, target),
  };

  // A playlist keeps one card for its whole run, edited as it advances. Songs
  // queued individually get a card each, so every one of them is left behind
  // with a button that replays that song.
  const sameCard =
    existing !== undefined &&
    (target.collectionId !== undefined
      ? existing.collectionId === target.collectionId
      : existing.collectionId === undefined &&
        (target.historyId === undefined || existing.historyId === target.historyId));

  const shouldRepost =
    repostWanted.delete(guildId) ||
    (messagesSincePost.get(guildId) ?? 0) >= REPOST_AFTER_MESSAGES ||
    existing?.channelId !== channelId ||
    !sameCard;

  const channel = await resolveChannel(channelId);
  if (!channel) {
    await reportChannel(guildId, channelId);
    return;
  }

  if (existing && !shouldRepost) {
    try {
      await channel.messages.edit(existing.messageId, payload);
      // A playlist card is edited song after song, so the play it is showing
      // has to move with it. Without this the card keeps the id it was posted
      // with and, left behind later, offers the playlist's first song.
      if (target.historyId !== undefined && target.historyId !== existing.historyId) {
        rememberPanel(guildId, { ...existing, historyId: target.historyId });
      }
      return;
    } catch (error) {
      log.debug({ guildId }, `Panel message could not be edited: ${toErrorMessage(error)}`);
    }
  }

  if (existing) {
    // A card for something that has finished stays in the channel with its own
    // Play again, so scrolling back through the evening lets any of those songs
    // or playlists be replayed. A repost for any other reason (chatter pushing
    // the card out of sight) is the same card moving down, so that one is
    // removed rather than duplicated.
    const replayable = existing.historyId !== undefined || existing.collectionId !== undefined;
    if (!sameCard && replayable) await demoteMessage(existing);
    else await deleteMessage(existing);
  }

  try {
    const message: Message = await channel.send(payload);
    reportedChannels.delete(channelId);
    rememberPanel(guildId, {
      channelId,
      messageId: message.id,
      // What the card stands for, so it can be left behind replayable rather
      // than deleted once something else takes its place.
      ...(target.historyId !== undefined ? { historyId: target.historyId } : {}),
      ...(target.collectionId !== undefined ? { collectionId: target.collectionId } : {}),
    });
    messagesSincePost.set(guildId, 0);
  } catch (error) {
    log.warn({ guildId, channelId }, `Could not post the music panel: ${toErrorMessage(error)}`);
    await reportChannel(guildId, channelId);
  }
}

/**
 * The stored play matching what the panel is about to show. Written on every
 * track start, so the newest row for this guild is the track that just began.
 */
function currentHistoryId(guildId: string, snapshot: PlayerSnapshot): number | undefined {
  if (!snapshot.current) return undefined;
  // Asked of the manager, which recorded it as the track started. Matching the
  // newest row by URL used to stand in for this and missed whenever the queue
  // was rearranged, leaving the card pointing at the song before.
  return playerManager.currentHistoryId(guildId);
}

/** Leaves an old card in place, carrying only a Play again for what it showed. */
async function demoteMessage(location: PanelLocation): Promise<void> {
  if (location.historyId === undefined && location.collectionId === undefined) {
    await deleteMessage(location);
    return;
  }
  const channel = await resolveChannel(location.channelId);
  if (!channel) return;
  try {
    await channel.messages.edit(location.messageId, {
      components: replayControls({
        historyId: location.historyId,
        collectionId: location.collectionId,
      }),
    });
  } catch (error) {
    log.debug({ messageId: location.messageId }, `Could not demote: ${toErrorMessage(error)}`);
  }
}

async function deleteMessage(location: PanelLocation): Promise<void> {
  const channel = await resolveChannel(location.channelId);
  if (!channel) return;
  try {
    await channel.messages.delete(location.messageId);
  } catch {
    // Already gone, which is the desired end state anyway.
  }
}

/**
 * Requests a panel refresh. Updates are coalesced so a burst of player events
 * results in a single edit.
 */
export function refreshPanel(
  guildId: string,
  options: { immediate?: boolean; repost?: boolean } = {},
): void {
  if (options.repost) repostWanted.add(guildId);
  const entry = pending.get(guildId) ?? { timer: null, lastEditAt: 0, running: false };
  pending.set(guildId, entry);

  const run = async (): Promise<void> => {
    entry.timer = null;
    if (entry.running) {
      // A refresh is already in flight; schedule one more afterwards.
      scheduleTrailing(guildId, entry);
      return;
    }
    entry.running = true;
    entry.lastEditAt = Date.now();
    try {
      await writePanel(guildId);
    } catch (error) {
      log.warn({ guildId }, `Panel update failed: ${toErrorMessage(error)}`);
    } finally {
      entry.running = false;
    }
  };

  const waited = Date.now() - entry.lastEditAt;
  if (options.immediate || waited >= EDIT_INTERVAL_MS) {
    if (entry.timer) clearTimeout(entry.timer);
    void run();
    return;
  }
  if (entry.timer) return;
  entry.timer = setTimeout(() => void run(), EDIT_INTERVAL_MS - waited);
}

function scheduleTrailing(guildId: string, entry: PendingUpdate): void {
  if (entry.timer) return;
  entry.timer = setTimeout(() => refreshPanel(guildId), EDIT_INTERVAL_MS);
}

/** Posts a fresh panel in a specific channel, replacing any previous one. */
export async function postPanel(guildId: string, channelId: string): Promise<void> {
  const existing = readState()[guildId];
  if (existing) await deleteMessage(existing);
  rememberPanel(guildId, null);
  messagesSincePost.set(guildId, REPOST_AFTER_MESSAGES);

  const channel = await resolveChannel(channelId);
  if (!channel) return;
  const live = snapshotFor(guildId);
  const snapshot = live ? withStoredHistory(guildId, live) : idleSnapshot(guildId);
  const message = await channel.send({
    embeds: [panelEmbed(snapshot)],
    components: musicControls(snapshot),
  });
  rememberPanel(guildId, { channelId, messageId: message.id });
  messagesSincePost.set(guildId, 0);
}

/**
 * Counts chatter in a music channel so the panel can be reposted at the bottom
 * once it has scrolled away.
 */
export function notePanelChannelMessage(guildId: string, channelId: string): void {
  const location = readState()[guildId];
  if (!location || location.channelId !== channelId) return;
  messagesSincePost.set(guildId, (messagesSincePost.get(guildId) ?? 0) + 1);
  if ((messagesSincePost.get(guildId) ?? 0) >= REPOST_AFTER_MESSAGES) {
    refreshPanel(guildId, { immediate: true });
  }
}

/** Keeps the panel in sync with playback. */
export function registerMusicPanel(): void {
  // Position ticks, volume, loop and queue edits all arrive as player updates.
  bus.on('player:update', (snapshot) => refreshPanel(snapshot.guildId));
  bus.on('settings:update', (settings) => refreshPanel(settings.guildId, { immediate: true }));
  // Every new track gets its own message so the queue is actually seen,
  // rather than an older message quietly changing further up the channel.
  playerManager.on('trackStart', ({ guildId }) =>
    refreshPanel(guildId, { immediate: true, repost: true }),
  );
  playerManager.on('trackEnd', ({ guildId }) => refreshPanel(guildId));
  playerManager.on('queueEnd', ({ guildId }) => refreshPanel(guildId, { immediate: true }));
  // Refreshed but not reposted: a connection is also opened to speak an arrival
  // or a reply, and reposting for those would delete and re-send the panel every
  // time somebody walked into a voice channel. A track starting reposts it.
  playerManager.on('created', ({ guildId }) => refreshPanel(guildId));
  playerManager.on('destroyed', ({ guildId }) => refreshPanel(guildId, { immediate: true }));
}

/** Redraws every stored panel after a restart so the controls work again. */
export async function restorePanels(): Promise<void> {
  const state = readState();
  for (const guildId of Object.keys(state)) {
    await writePanel(guildId).catch((error: unknown) => {
      log.debug({ guildId }, `Could not restore the panel: ${toErrorMessage(error)}`);
    });
  }
}

import { ChannelType, type Message, type SendableChannels } from 'discord.js';
import type { PlayerSnapshot } from '@phybot/shared';
import { bus } from '../core/bus.js';
import { createLogger } from '../core/logger.js';
import { toErrorMessage } from '../core/errors.js';
import { stateRepository } from '../db/repositories/state.js';
import { settingsRepository } from '../db/repositories/settings.js';
import { playerManager } from '../music/manager.js';
import { musicControls, panelEmbed } from './embeds.js';
import { tryGetClient } from './client.js';

const log = createLogger('panel');

/**
 * The music channel keeps one message that always shows what is playing, the
 * queue and the controls. It is edited in place instead of posting a new card
 * per track, and reposted when it scrolls out of sight.
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

function snapshotFor(guildId: string): PlayerSnapshot | null {
  const player = playerManager.get(guildId);
  return player ? player.snapshot() : null;
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
    history: [],
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

  const snapshot = snapshotFor(guildId) ?? idleSnapshot(guildId);
  const payload = { embeds: [panelEmbed(snapshot)], components: musicControls(snapshot) };

  const existing = readState()[guildId];
  const shouldRepost =
    repostWanted.delete(guildId) ||
    (messagesSincePost.get(guildId) ?? 0) >= REPOST_AFTER_MESSAGES ||
    existing?.channelId !== channelId;

  const channel = await resolveChannel(channelId);
  if (!channel) {
    log.debug({ guildId, channelId }, 'Music channel is missing or not writable');
    return;
  }

  if (existing && !shouldRepost) {
    try {
      await channel.messages.edit(existing.messageId, payload);
      return;
    } catch (error) {
      log.debug({ guildId }, `Panel message could not be edited: ${toErrorMessage(error)}`);
    }
  }

  if (existing) await deleteMessage(existing);

  try {
    const message: Message = await channel.send(payload);
    rememberPanel(guildId, { channelId, messageId: message.id });
    messagesSincePost.set(guildId, 0);
  } catch (error) {
    log.warn({ guildId, channelId }, `Could not post the music panel: ${toErrorMessage(error)}`);
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
  const snapshot = snapshotFor(guildId) ?? idleSnapshot(guildId);
  const message = await channel.send({
    embeds: [panelEmbed(snapshot)],
    components: musicControls(snapshot),
  });
  rememberPanel(guildId, { channelId, messageId: message.id });
  messagesSincePost.set(guildId, 0);
}

export async function removePanel(guildId: string): Promise<void> {
  const existing = readState()[guildId];
  if (existing) await deleteMessage(existing);
  rememberPanel(guildId, null);
  messagesSincePost.delete(guildId);
  pending.delete(guildId);
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
  playerManager.on('created', ({ guildId }) =>
    refreshPanel(guildId, { immediate: true, repost: true }),
  );
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

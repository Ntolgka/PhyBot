import type { VoiceState } from 'discord.js';
import { speakInVoice } from '../../ai/index.js';
import { createLogger } from '../../core/logger.js';
import { toErrorMessage } from '../../core/errors.js';
import { settingsRepository } from '../../db/repositories/settings.js';
import { playerManager } from '../../music/manager.js';
import { announcementsFor, type VoiceAnnouncement } from './logic.js';

const log = createLogger('voice-announce');

/**
 * Someone flipping between channels should not queue a minute of speech. Each
 * person's arrivals and departures are spaced out; anything faster is dropped.
 */
const PER_USER_COOLDOWN_MS = 5_000;
/** A burst of people joining at once is announced, but not without limit. */
const MAX_QUEUE_LENGTH = 6;

interface QueueItem extends VoiceAnnouncement {
  guildId: string;
}

const queues = new Map<string, QueueItem[]>();
const running = new Set<string>();
/** `guildId:userId:kind` -> when that person was last announced. */
const lastSpoken = new Map<string, number>();

/** Humans in a voice channel, which is what decides whether talking is pointless. */
function humanCount(state: VoiceState, channelId: string): number {
  const channel = state.guild.channels.cache.get(channelId);
  if (!channel || !channel.isVoiceBased()) return 0;
  return channel.members.filter((member) => !member.user.bot).size;
}

/**
 * Handles one voice state change. Returns immediately; the speaking itself is
 * queued so two people joining together are announced one after the other
 * rather than talking over each other.
 */
export function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
  const guildId = newState.guild.id;
  const member = newState.member ?? oldState.member;
  if (!member) return;
  if (!settingsRepository.get(guildId).voiceAnnounceEnabled) return;

  const announcements = announcementsFor({
    displayName: member.displayName,
    isBot: member.user.bot,
    before: {
      channelId: oldState.channelId,
      ...(oldState.channelId ? { listenersAfter: humanCount(oldState, oldState.channelId) } : {}),
    },
    after: { channelId: newState.channelId },
  });
  if (announcements.length === 0) return;

  const now = Date.now();
  const queue = queues.get(guildId) ?? [];
  for (const announcement of announcements) {
    const key = `${guildId}:${member.id}:${announcement.kind}`;
    if (now - (lastSpoken.get(key) ?? 0) < PER_USER_COOLDOWN_MS) continue;
    if (queue.length >= MAX_QUEUE_LENGTH) {
      log.debug({ guildId }, 'Dropped an announcement: too many queued');
      break;
    }
    lastSpoken.set(key, now);
    queue.push({ ...announcement, guildId });
  }
  if (queue.length === 0) return;
  queues.set(guildId, queue);

  void drain(guildId);
}

async function drain(guildId: string): Promise<void> {
  if (running.has(guildId)) return;
  running.add(guildId);

  try {
    for (;;) {
      // Re-read the switch on every line, so turning it off mid-burst stops the
      // rest instead of letting a queued backlog talk over the decision.
      if (!settingsRepository.get(guildId).voiceAnnounceEnabled) {
        queues.delete(guildId);
        break;
      }

      const queue = queues.get(guildId);
      const item = queue?.shift();
      if (!item) break;

      // Moving the bot away would cut the music off for everyone listening, so
      // an event in another channel is skipped whenever a track is loaded -
      // paused counts, because someone is coming back to it.
      const player = playerManager.get(guildId);
      if (player && player.snapshot().current !== null && player.channelId !== item.channelId) {
        log.debug({ guildId }, 'Skipped an announcement: music is loaded in another channel');
        continue;
      }

      try {
        await speakInVoice({ guildId, text: item.text, voiceChannelId: item.channelId });
      } catch (error) {
        log.warn({ guildId, err: toErrorMessage(error) }, 'Could not announce a voice change');
      }
    }
  } finally {
    running.delete(guildId);
    queues.delete(guildId);
  }
}

/** Forgets pending work for a guild; used when the bot leaves or shuts down. */
export function resetVoiceAnnouncements(guildId?: string): void {
  if (guildId) {
    queues.delete(guildId);
    return;
  }
  queues.clear();
  lastSpoken.clear();
}

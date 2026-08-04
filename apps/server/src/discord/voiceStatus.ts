import { truncate } from '@phybot/shared';
import { bus } from '../core/bus.js';
import { createLogger } from '../core/logger.js';
import { toErrorMessage } from '../core/errors.js';
import { playerManager } from '../music/manager.js';
import { tryGetClient } from './client.js';

const log = createLogger('voice-status');

/**
 * Shows the current track as the voice channel's status line, the small text
 * Discord renders under the channel name.
 *
 * discord.js has no helper for this endpoint yet, so the REST route is called
 * directly. It needs the Set Voice Channel Status permission; without it
 * Discord answers 403 and the feature simply stays quiet.
 */
const MUSIC_EMOJI = '🎶';
/** Discord accepts up to 500 characters; keep it short enough to read. */
const MAX_STATUS_LENGTH = 100;

/** Last value written per channel, so identical updates are skipped. */
const written = new Map<string, string>();
const unsupported = new Set<string>();

async function setStatus(channelId: string, status: string | null): Promise<void> {
  const client = tryGetClient();
  if (!client?.isReady()) return;
  if (unsupported.has(channelId)) return;

  const value = status ?? '';
  if (written.get(channelId) === value) return;

  try {
    await client.rest.put(`/channels/${channelId}/voice-status` as `/${string}`, {
      body: { status: status ?? null },
    });
    if (status === null) written.delete(channelId);
    else written.set(channelId, value);
  } catch (error) {
    const message = toErrorMessage(error);
    // Missing permission or an unsupported channel type: stop trying for it.
    if (message.includes('Missing Permissions') || message.includes('403')) {
      unsupported.add(channelId);
      log.info(
        { channelId },
        'Cannot set the voice channel status. Give the bot the Set Voice Channel Status permission to show the current track there.',
      );
      return;
    }
    log.debug({ channelId }, `Voice channel status update failed: ${message}`);
  }
}

function describe(guildId: string): { channelId: string | null; status: string | null } {
  const player = playerManager.get(guildId);
  if (!player) return { channelId: null, status: null };

  const snapshot = player.snapshot();
  if (!snapshot.current || snapshot.status === 'idle' || snapshot.status === 'stopped') {
    return { channelId: snapshot.voiceChannelId, status: null };
  }

  const artist = snapshot.current.author ? ` - ${snapshot.current.author}` : '';
  const label = truncate(`${snapshot.current.title}${artist}`, MAX_STATUS_LENGTH - 3);
  const prefix = snapshot.status === 'paused' ? '⏸' : MUSIC_EMOJI;
  return { channelId: snapshot.voiceChannelId, status: `${prefix} ${label}` };
}

/** Remembers where a guild was playing so the status can be cleared on leave. */
const lastChannelByGuild = new Map<string, string>();

async function apply(guildId: string): Promise<void> {
  const { channelId, status } = describe(guildId);
  if (!channelId) return;
  lastChannelByGuild.set(guildId, channelId);
  await setStatus(channelId, status);
}

/** Clears the status of every channel the bot wrote to, used on shutdown. */
export async function clearAllVoiceStatuses(): Promise<void> {
  for (const channelId of [...written.keys()]) {
    await setStatus(channelId, null);
  }
}

export function registerVoiceStatus(): void {
  // Pausing, resuming and track changes all arrive as player updates, and
  // identical status text is skipped, so this stays cheap.
  bus.on('player:update', (snapshot) => void apply(snapshot.guildId));
  playerManager.on('trackStart', ({ guildId }) => void apply(guildId));
  playerManager.on('queueEnd', ({ guildId }) => void apply(guildId));
  playerManager.on('destroyed', ({ guildId }) => {
    const channelId = lastChannelByGuild.get(guildId);
    lastChannelByGuild.delete(guildId);
    if (channelId) void setStatus(channelId, null);
  });
}

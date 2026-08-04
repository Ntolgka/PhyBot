import { ActivityType, type PresenceStatusData } from 'discord.js';
import type { PresenceSettings } from '@phybot/shared';
import { truncate } from '@phybot/shared';
import { createLogger } from '../core/logger.js';
import { toErrorMessage } from '../core/errors.js';
import { STATE_KEYS, stateRepository } from '../db/repositories/state.js';
import { playerManager } from '../music/manager.js';
import { tryGetClient } from './client.js';

const log = createLogger('presence');

const DEFAULT_PRESENCE: PresenceSettings = {
  status: 'online',
  activityType: 'listening',
  activityName: '/play',
  activityUrl: null,
  showNowPlaying: true,
};

const ACTIVITY_TYPES: Record<PresenceSettings['activityType'], ActivityType> = {
  playing: ActivityType.Playing,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing,
  custom: ActivityType.Custom,
};

export function getPresence(): PresenceSettings {
  return stateRepository.get<PresenceSettings>(STATE_KEYS.presence, DEFAULT_PRESENCE);
}

export function setPresence(patch: Partial<PresenceSettings>): PresenceSettings {
  const next = stateRepository.merge<PresenceSettings>(
    STATE_KEYS.presence,
    DEFAULT_PRESENCE,
    patch,
  );
  applyPresence();
  return next;
}

/** Pushes the stored presence (or the current track) to Discord. */
export function applyPresence(): void {
  const client = tryGetClient();
  if (!client?.isReady()) return;

  const settings = getPresence();
  let name = settings.activityName;
  let type = ACTIVITY_TYPES[settings.activityType];

  if (settings.showNowPlaying) {
    const playing = playerManager
      .list()
      .map((player) => player.snapshot())
      .find((snapshot) => snapshot.status === 'playing' && snapshot.current);
    if (playing?.current) {
      name = truncate(playing.current.title, 100);
      type = ActivityType.Listening;
    }
  }

  try {
    client.user.setPresence({
      status: settings.status as PresenceStatusData,
      activities: name
        ? [
            {
              name,
              type,
              ...(settings.activityUrl ? { url: settings.activityUrl } : {}),
            },
          ]
        : [],
    });
  } catch (error) {
    log.warn(`Could not update the presence: ${toErrorMessage(error)}`);
  }
}

/** Keeps the presence in sync with playback. */
export function registerPresenceUpdates(): void {
  playerManager.on('trackStart', () => applyPresence());
  playerManager.on('queueEnd', () => applyPresence());
  playerManager.on('destroyed', () => applyPresence());
}

export const PRESENCE_STATUSES = ['online', 'idle', 'dnd', 'invisible'] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export const ACTIVITY_TYPES = ['playing', 'listening', 'watching', 'competing', 'custom'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface BotProfile {
  id: string;
  username: string;
  discriminator: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  /** Application description shown on the bot's Discord profile. */
  description: string;
  tags: string[];
  inviteUrl: string;
}

export interface PresenceSettings {
  status: PresenceStatus;
  activityType: ActivityType;
  activityName: string;
  /** Only used by the streaming activity type. */
  activityUrl: string | null;
  /** Replace the activity text with the currently playing track. */
  showNowPlaying: boolean;
}

export interface BotStatus {
  online: boolean;
  ready: boolean;
  /** Websocket heartbeat latency in milliseconds; -1 while unknown. */
  ping: number;
  uptimeSeconds: number;
  guildCount: number;
  userCount: number;
  activePlayers: number;
  memoryMb: number;
  version: string;
  startedAt: number | null;
  lastError: string | null;
}

export interface LogEntry {
  id: number;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  scope: string;
  at: number;
}

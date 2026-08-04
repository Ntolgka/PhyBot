import type { Track, TrackSource } from '@phybot/shared';

/** Response of GET /guilds/:guildId/history. Not exported by @phybot/shared
 * (defined inline in Notes/api-contract.md), mirrored here verbatim. */
export interface HistoryEntry {
  id: string;
  guildId: string;
  title: string;
  author: string;
  url: string;
  source: TrackSource;
  duration: number;
  requestedBy: string;
  playedAt: number;
}

/** Response entry of GET /guilds/:guildId/top-tracks. */
export interface TopTrack {
  title: string;
  author: string;
  url: string;
  plays: number;
}

/** Response of POST /guilds/:guildId/player/play. */
export interface PlayResponse {
  playlistName: string | null;
  added: number;
  rejected: number;
  truncated: number;
  tracks: Track[];
}

export interface JoinParams {
  voiceChannelId: string;
  textChannelId?: string;
}

export interface SkipParams {
  count?: number;
}

export interface SeekParams {
  position: number;
}

export interface SeekRelativeParams {
  delta: number;
}

export interface VolumeParams {
  volume: number;
}

export interface ToggleParams {
  enabled: boolean;
}

export interface JumpParams {
  index: number;
}

export interface QueueMoveParams {
  from: number;
  to: number;
}

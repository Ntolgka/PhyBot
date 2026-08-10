export const TRACK_SOURCES = ['youtube', 'soundcloud', 'spotify', 'radio', 'file'] as const;
export type TrackSource = (typeof TRACK_SOURCES)[number];

export const LOOP_MODES = ['off', 'track', 'queue'] as const;
export type LoopMode = (typeof LOOP_MODES)[number];

export const PLAYER_STATUSES = ['idle', 'loading', 'playing', 'paused', 'stopped'] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

export interface Track {
  /** Stable identifier for this queue entry (not the provider id). */
  id: string;
  title: string;
  author: string;
  /** Page the track came from, shown to users and reused when resolving. */
  url: string;
  /** Duration in seconds; 0 for live streams. */
  duration: number;
  isLive: boolean;
  thumbnail: string | null;
  source: TrackSource;
  /** Discord user id of whoever queued the track. */
  requestedBy: string;
  requestedByName: string;
  addedAt: number;
  /**
   * Search terms used when the original source cannot be streamed directly
   * (Spotify tracks are matched against YouTube at playback time).
   */
  searchQuery?: string;
}

export interface PlayerSnapshot {
  guildId: string;
  guildName: string;
  status: PlayerStatus;
  /** Currently loaded track, or null when the queue is empty. */
  current: Track | null;
  /** Playback position of the current track in seconds. */
  position: number;
  queue: Track[];
  /** Tracks that already played, newest first, used by the previous control. */
  history: Track[];
  volume: number;
  loop: LoopMode;
  shuffle: boolean;
  autoplay: boolean;
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  textChannelId: string | null;
  /** Total duration of the pending queue in seconds; -1 when it contains a stream. */
  queueDuration: number;
  updatedAt: number;
}

export interface SpotifyConnection {
  /** True once the owner has linked a Spotify account to the bot. */
  connected: boolean;
  displayName: string | null;
  /** False when SPOTIFY_CLIENT_ID/SECRET are missing, so linking is impossible. */
  configured: boolean;
  /** Redirect URI that must be registered in the Spotify application. */
  redirectUri: string;
  connectedAt: number | null;
  lastError: string | null;
}

export interface SearchResult {
  title: string;
  author: string;
  url: string;
  duration: number;
  thumbnail: string | null;
  source: TrackSource;
  isLive: boolean;
}

export interface ResolvedRequest {
  /** Playlist/album name when the request expanded into multiple tracks. */
  playlistName: string | null;
  playlistUrl: string | null;
  tracks: Track[];
  /** Tracks that were dropped because the queue limit was reached. */
  truncated: number;
  /**
   * True when the source could only share part of the collection, so the
   * number of missing tracks is unknown (Spotify caps public playlist reads).
   */
  partial?: boolean;
}

export interface LyricLine {
  /** Seconds from the start of the track. */
  at: number;
  text: string;
}

/** Lyrics for the track that is playing, timed when the source has timings. */
export interface TrackLyrics {
  artist: string;
  title: string;
  lines: LyricLine[];
  plain: string;
  synced: boolean;
  source: string;
}

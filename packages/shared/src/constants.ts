/** Values shared by the bot, the HTTP API and the dashboard. */

/** Path the dashboard uses for the realtime connection. */
export const WS_PATH = '/api/ws';

/** Name of the session cookie issued after a successful dashboard login. */
export const SESSION_COOKIE = 'phybot_session';

/** How long a dashboard session stays valid, in seconds. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

/** Seek step used by the "rewind"/"forward" controls, in seconds. */
export const SEEK_STEP_SECONDS = 5;

/** Hard limit on queue length to keep memory and Discord embeds sane. */
export const MAX_QUEUE_SIZE = 1000;

/** Maximum number of tracks imported from a single playlist request. */
export const MAX_PLAYLIST_IMPORT = 500;

/** Volume bounds in percent. */
export const MIN_VOLUME = 0;
export const MAX_VOLUME = 200;

/** Number of log lines kept in memory for the dashboard console. */
export const LOG_BUFFER_SIZE = 500;

/** Discord limits the avatar/banner payload; keep uploads well below it. */
export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;

export const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

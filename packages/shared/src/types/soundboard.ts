/** Maximum length and size accepted for an uploaded soundboard clip. */
export const MAX_SOUND_DURATION_SECONDS = 30;
export const MAX_SOUND_UPLOAD_BYTES = 8 * 1024 * 1024;

export const SUPPORTED_SOUND_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
] as const;

export interface Sound {
  id: number;
  guildId: string;
  /** Lowercase trigger used by /sound and by the optional own command. */
  name: string;
  description: string;
  /** File name inside the sounds directory; never a client supplied path. */
  fileName: string;
  originalName: string;
  durationSeconds: number;
  sizeBytes: number;
  emoji: string | null;
  /** Register this sound as its own slash command as well. */
  slash: boolean;
  /** Playback volume for this clip in percent. */
  volume: number;
  uses: number;
  createdAt: number;
  updatedAt: number;
}

export interface SoundInput {
  guildId: string;
  name: string;
  description?: string;
  emoji?: string | null;
  slash?: boolean;
  volume?: number;
  /** Data URL of the audio file, only used when creating or replacing a clip. */
  file?: string;
  originalName?: string;
}

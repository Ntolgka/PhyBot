import type { Sound, SoundInput } from '@phybot/shared';
import { AppError, NotFoundError, toErrorMessage } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import { deployGuildCustomCommands } from '../discord/deploy.js';
import { decodeBufferToPcm } from '../music/audioStream.js';
import { playerManager } from '../music/manager.js';
import { join } from '../music/service.js';
import { soundRepository } from './repository.js';
import { deleteSoundFile, readSoundFile, saveSoundFile, type SavedSound } from './storage.js';
import { scalePcmVolume } from './volume.js';

const log = createLogger('soundboard');

/** Bounded LRU cache of decoded PCM, so a repeated clip does not re-run
 * ffmpeg on every play. Keyed by the stored file name. */
const MAX_PCM_CACHE_ENTRIES = 25;
const pcmCache = new Map<string, Buffer>();

function cachePcm(fileName: string, pcm: Buffer): void {
  pcmCache.set(fileName, pcm);
  if (pcmCache.size <= MAX_PCM_CACHE_ENTRIES) return;
  const oldestKey = pcmCache.keys().next().value;
  if (oldestKey !== undefined) pcmCache.delete(oldestKey);
}

function invalidatePcmCache(fileName: string): void {
  pcmCache.delete(fileName);
}

async function decodedPcmFor(sound: Sound): Promise<Buffer> {
  const cached = pcmCache.get(sound.fileName);
  if (cached) {
    // Touch the entry so it counts as recently used for eviction order.
    pcmCache.delete(sound.fileName);
    pcmCache.set(sound.fileName, cached);
    return cached;
  }

  const raw = await readSoundFile(sound.fileName);
  const pcm = await decodeBufferToPcm(raw);
  cachePcm(sound.fileName, pcm);
  return pcm;
}

/** Slash registration must not fail the request; report failures in the logs. */
async function syncSlashCommands(guildId: string): Promise<void> {
  try {
    await deployGuildCustomCommands(guildId);
  } catch (error) {
    log.warn({ guildId }, `Could not refresh slash commands: ${toErrorMessage(error)}`);
  }
}

export function listSounds(guildId: string): Sound[] {
  return soundRepository.list(guildId);
}

export async function createSound(input: SoundInput): Promise<Sound> {
  if (!input.file) {
    throw new AppError('missing_file', 'An audio file is required', 400);
  }

  const saved = await saveSoundFile(input.file);
  try {
    const sound = soundRepository.create({
      guildId: input.guildId,
      name: input.name,
      description: input.description ?? '',
      fileName: saved.fileName,
      originalName: input.originalName ?? '',
      durationMs: saved.durationMs,
      sizeBytes: saved.sizeBytes,
      emoji: input.emoji ?? null,
      slash: input.slash ?? false,
      volume: input.volume ?? 100,
    });
    if (sound.slash) await syncSlashCommands(sound.guildId);
    return sound;
  } catch (error) {
    await deleteSoundFile(saved.fileName);
    throw error;
  }
}

export type SoundPatch = Partial<Omit<SoundInput, 'guildId'>>;

export async function updateSound(id: number, patch: SoundPatch): Promise<Sound> {
  const existing = soundRepository.getById(id);
  if (!existing) throw new NotFoundError('That sound does not exist');

  let saved: SavedSound | undefined;
  if (patch.file) {
    saved = await saveSoundFile(patch.file);
  }

  try {
    const updated = soundRepository.update(id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.emoji !== undefined ? { emoji: patch.emoji } : {}),
      ...(patch.slash !== undefined ? { slash: patch.slash } : {}),
      ...(patch.volume !== undefined ? { volume: patch.volume } : {}),
      ...(patch.originalName !== undefined ? { originalName: patch.originalName } : {}),
      ...(saved
        ? { fileName: saved.fileName, durationMs: saved.durationMs, sizeBytes: saved.sizeBytes }
        : {}),
    });
    if (!updated) throw new NotFoundError('That sound does not exist');

    if (saved) {
      await deleteSoundFile(existing.fileName);
      invalidatePcmCache(existing.fileName);
    }
    if (updated.slash || existing.slash !== updated.slash || existing.name !== updated.name) {
      await syncSlashCommands(updated.guildId);
    }
    return updated;
  } catch (error) {
    if (saved) await deleteSoundFile(saved.fileName);
    throw error;
  }
}

export async function deleteSound(id: number): Promise<void> {
  const existing = soundRepository.getById(id);
  if (!existing) throw new NotFoundError('That sound does not exist');

  soundRepository.delete(id);
  invalidatePcmCache(existing.fileName);
  await deleteSoundFile(existing.fileName);
  if (existing.slash) await syncSlashCommands(existing.guildId);
}

export interface PlaySoundParams {
  guildId: string;
  soundId?: number;
  name?: string;
  voiceChannelId?: string;
  requestedBy?: string;
}

function resolveSound(params: PlaySoundParams): Sound | null {
  if (params.soundId !== undefined) return soundRepository.getById(params.soundId);
  if (params.name) return soundRepository.getByName(params.guildId, params.name);
  throw new AppError('missing_sound', 'Provide a sound id or name', 400);
}

/** Resolves the sound, joins the requested voice channel when the bot is not
 * already connected, and plays the clip over the shared music player. */
export async function playSound(params: PlaySoundParams): Promise<Sound> {
  const sound = resolveSound(params);
  if (!sound || sound.guildId !== params.guildId) {
    throw new NotFoundError('That sound does not exist');
  }

  let player = playerManager.get(params.guildId);
  if (!player) {
    if (!params.voiceChannelId) {
      throw new AppError(
        'no_voice_channel',
        'Join a voice channel first, or pick one to play in',
        400,
      );
    }
    player = await join(params.guildId, params.voiceChannelId);
  }

  log.debug(
    { guildId: params.guildId, sound: sound.name, requestedBy: params.requestedBy },
    'Playing soundboard clip',
  );

  const pcm = await decodedPcmFor(sound);
  await player.playAnnouncement(scalePcmVolume(pcm, sound.volume / 100));
  soundRepository.incrementUses(sound.id);
  return sound;
}

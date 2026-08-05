import type { AiRuntimeStatus, AiSettings } from '@phybot/shared';
import { bus } from '../core/bus.js';
import { AppError } from '../core/errors.js';
import { settingsRepository } from '../db/repositories/settings.js';
import { playerManager } from '../music/manager.js';
import { join } from '../music/service.js';
import { runChat, type ChatParams } from './assistant.js';
import * as memory from './memory.js';
import {
  getAiSettings as readAiSettings,
  updateAiSettings as writeAiSettings,
} from './settings.js';
import { speak } from './speak.js';
import { getAiStatus as readAiStatus } from './status.js';
import { listVoices as readVoices } from './tts/index.js';
import {
  startListening,
  stopAllListening,
  stopListening,
  storedListeningSessions,
} from './voice/listener.js';

/** Returns the persisted assistant settings, seeded from `.env` on first use. */
export function getAiSettings(): AiSettings {
  return readAiSettings();
}

/** Applies a validated settings patch, persists it and notifies the dashboard. */
export function updateAiSettings(patch: Partial<AiSettings>): AiSettings {
  const next = writeAiSettings(patch);
  bus.emit('ai:settings', next);
  bus.emit('ai:status', getAiStatus());
  return next;
}

/** Current readiness of the assistant: which capabilities work and which guilds are listening. */
export function getAiStatus(): AiRuntimeStatus {
  return readAiStatus();
}

/** Curated list of text-to-speech voices offered by the dashboard. */
export function listVoices(): { id: string; label: string }[] {
  return readVoices();
}

/** True when a chat-capable provider is configured and ready to answer. */
export function isConfigured(): boolean {
  return getAiStatus().textReady;
}

/**
 * Sends a message - typed on the dashboard or transcribed from voice - to the
 * assistant and returns its reply. Always resolves; configuration and
 * provider errors degrade to a friendly message instead of throwing so the
 * rest of the bot keeps working without AI.
 */
export async function chat(params: ChatParams): Promise<string> {
  const settings = getAiSettings();
  const status = getAiStatus();
  return runChat(params, settings, status.textReady);
}

export interface SpeakInVoiceParams {
  guildId: string;
  text: string;
  voiceChannelId?: string;
  /** Registry id of the voice to speak with. */
  voiceId?: number;
}

/** Synthesises `text` and plays it in the guild's voice channel. Throws on failure. */
export async function speakInVoice(params: SpeakInVoiceParams): Promise<void> {
  await speak(params);
}

export interface SetListeningParams {
  guildId: string;
  enabled: boolean;
  voiceChannelId?: string;
}

/** Enables or disables voice-command listening for a guild. Throws on failure. */
export async function setListening(params: SetListeningParams): Promise<AiRuntimeStatus> {
  if (!params.enabled) {
    stopListening(params.guildId);
    return getAiStatus();
  }

  // The per-server switch used to be display only, which made a server with the
  // assistant turned off look like a broken bot instead of a disabled feature.
  if (!settingsRepository.get(params.guildId).aiVoiceEnabled) {
    throw new AppError(
      'ai_voice_disabled',
      'Sesli asistan bu sunucu icin kapali, once ayarlardan acin',
      400,
    );
  }

  const settings = getAiSettings();
  if (settings.sttProvider === 'none' || !getAiStatus().sttReady) {
    throw new AppError(
      'ai_not_configured',
      'Konusma tanima icin bir saglayici ve API anahtari ayarlanmali',
      400,
    );
  }

  // When a channel is given the bot joins it, and moves there if it was
  // already connected somewhere else: listening in another channel would look
  // like the assistant is simply ignoring whoever asked for it.
  let player = params.voiceChannelId
    ? await join(params.guildId, params.voiceChannelId)
    : playerManager.get(params.guildId);

  if (!player) {
    throw new AppError(
      'no_voice_channel',
      'Dinlemeye baslamak icin bir ses kanali belirtilmeli',
      400,
    );
  }

  const connection = player.voiceConnection;
  if (!connection) {
    throw new AppError('no_voice_connection', 'Ses baglantisi kurulamadi', 500);
  }

  startListening({ guildId: params.guildId, connection, player });
  return getAiStatus();
}

/**
 * Reopens the listening sessions that were active before the last shutdown, so
 * a restart does not quietly switch the assistant off.
 */
export async function resumeListening(): Promise<void> {
  for (const session of storedListeningSessions()) {
    try {
      await setListening({
        guildId: session.guildId,
        enabled: true,
        voiceChannelId: session.voiceChannelId,
      });
    } catch {
      // The channel may be gone or the provider unset; the session is dropped.
      stopListening(session.guildId);
    }
  }
}

/** Stops every background activity owned by this module; safe to call repeatedly. */
export function stopAll(): void {
  stopAllListening();
  memory.clearHistory();
}

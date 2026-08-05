import type { AiSettings, TtsVoice } from '@phybot/shared';
import { config } from '../../core/config.js';
import { AppError, ExternalServiceError } from '../../core/errors.js';
import { createLogger } from '../../core/logger.js';
import { decodeBufferToPcm, pcmToWav } from '../../music/audioStream.js';
import { synthesizeWithGemini } from '../providers/index.js';
import { synthesizeWithCommand } from './commandVoice.js';
import { voiceRegistry } from './registry.js';
import { synthesize as synthesizeEdge } from './edgeTts.js';

const log = createLogger('ai:tts');

export { listCatalog } from './catalog.js';
export { voiceRegistry } from './registry.js';

/** Voices offered in the pickers, newest registry state each call. */
export function listVoices(): { id: string; label: string }[] {
  return voiceRegistry
    .list({ enabledOnly: true })
    .map((voice) => ({ id: voice.voiceId, label: voice.name }));
}

export function isKnownVoice(voiceId: string): boolean {
  return voiceRegistry.list().some((voice) => voice.voiceId === voiceId);
}

/** Resolves the voice to speak with: an explicit choice, else the default. */
export function resolveVoice(voiceRecordId?: number): TtsVoice | null {
  if (voiceRecordId !== undefined) return voiceRegistry.require(voiceRecordId);
  return voiceRegistry.getDefault();
}

async function synthesizeWithVoice(voice: TtsVoice, text: string): Promise<Buffer> {
  switch (voice.provider) {
    case 'edge':
      return decodeBufferToPcm(await synthesizeEdge(text, voice.voiceId));
    case 'gemini': {
      const { pcm, sampleRate } = await synthesizeWithGemini(text, 'gemini-2.5-flash-preview-tts');
      return decodeBufferToPcm(pcmToWav(pcm, sampleRate, 1));
    }
    case 'command':
      return decodeBufferToPcm(await synthesizeWithCommand(voice, text));
    default:
      throw new AppError('unknown_provider', `Unknown speech provider for "${voice.name}"`, 400);
  }
}

/**
 * Renders text to 48 kHz stereo PCM ready for `GuildPlayer.playAnnouncement`.
 * A specific registry voice can be requested; otherwise the default voice is
 * used, and Edge failures fall back to Gemini when a key is configured.
 */
export async function synthesizeSpeech(
  text: string,
  settings: AiSettings,
  voiceRecordId?: number,
): Promise<Buffer> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new AppError('empty_tts_text', 'Konusulacak bir metin yok', 400);
  }

  const voice = resolveVoice(voiceRecordId);
  if (voice) {
    try {
      return await synthesizeWithVoice(voice, trimmed);
    } catch (error) {
      // A chosen voice that fails is reported rather than silently swapped.
      if (voice.provider !== 'edge') throw error;
      log.warn({ err: error, voice: voice.name }, 'Edge voice failed, trying the fallback');
    }
  }

  // No registry entry yet, or the Edge voice failed: use the configured voice.
  try {
    return await decodeBufferToPcm(
      await synthesizeEdge(trimmed, voice?.voiceId ?? settings.ttsVoice),
    );
  } catch (edgeError) {
    log.warn({ err: edgeError }, 'Edge TTS failed, trying Gemini fallback');

    if (!config.ai.geminiApiKey) {
      throw new ExternalServiceError(
        'tts',
        'Sesli yanit olusturulamadi (Edge TTS basarisiz oldu ve Gemini anahtari tanimli degil)',
      );
    }
    try {
      const { pcm, sampleRate } = await synthesizeWithGemini(
        trimmed,
        'gemini-2.5-flash-preview-tts',
      );
      return await decodeBufferToPcm(pcmToWav(pcm, sampleRate, 1));
    } catch (geminiError) {
      log.warn({ err: geminiError }, 'Gemini TTS fallback also failed');
      throw new ExternalServiceError('tts', 'Sesli yanit olusturulamadi');
    }
  }
}

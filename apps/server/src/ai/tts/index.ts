import type { AiSettings } from '@phybot/shared';
import { config } from '../../core/config.js';
import { AppError, ExternalServiceError } from '../../core/errors.js';
import { createLogger } from '../../core/logger.js';
import { decodeBufferToPcm, pcmToWav } from '../../music/audioStream.js';
import { synthesizeWithGemini } from '../providers/index.js';
import { synthesize as synthesizeEdge } from './edgeTts.js';

const log = createLogger('ai:tts');

export { listVoices, isKnownVoice } from './voices.js';

/**
 * Renders text to speech and returns 48 kHz stereo PCM ready for
 * `GuildPlayer.playAnnouncement`. Microsoft Edge's free neural voices are
 * tried first; if that undocumented endpoint is unreachable and a Gemini key
 * is configured, Gemini's audio-output mode is used instead.
 */
export async function synthesizeSpeech(text: string, settings: AiSettings): Promise<Buffer> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new AppError('empty_tts_text', 'Konusulacak bir metin yok', 400);
  }

  try {
    const mp3 = await synthesizeEdge(trimmed, settings.ttsVoice);
    return await decodeBufferToPcm(mp3);
  } catch (edgeError) {
    log.warn({ err: edgeError }, 'Edge TTS failed, trying Gemini fallback');

    if (!config.ai.geminiApiKey) {
      throw new ExternalServiceError(
        'tts',
        'Sesli yanit olusturulamadi (Edge TTS basarisiz oldu ve Gemini anahtari tanimli degil)',
      );
    }

    try {
      const model = 'gemini-2.5-flash-preview-tts';
      const { pcm, sampleRate } = await synthesizeWithGemini(trimmed, model);
      const wav = pcmToWav(pcm, sampleRate, 1);
      return await decodeBufferToPcm(wav);
    } catch (geminiError) {
      log.warn({ err: geminiError }, 'Gemini TTS fallback also failed');
      throw new ExternalServiceError('tts', 'Sesli yanit olusturulamadi');
    }
  }
}

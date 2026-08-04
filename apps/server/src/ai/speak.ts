import { AppError } from '../core/errors.js';
import { playerManager } from '../music/manager.js';
import { join } from '../music/service.js';
import { getAiSettings } from './settings.js';
import { synthesizeSpeech } from './tts/index.js';

export interface SpeakParams {
  guildId: string;
  text: string;
  voiceChannelId?: string;
}

/**
 * Synthesises `text` and plays it over the guild's voice connection, joining
 * `voiceChannelId` first when the bot is not already connected. Shared by the
 * public `speakInVoice` entry point and the voice listener's own replies.
 */
export async function speak(params: SpeakParams): Promise<void> {
  const trimmed = params.text.trim();
  if (!trimmed) return;

  let player = playerManager.get(params.guildId);
  if (!player) {
    if (!params.voiceChannelId) {
      throw new AppError(
        'no_voice_channel',
        'Konusmak icin once bir ses kanalina katilmam gerekiyor',
        400,
      );
    }
    player = await join(params.guildId, params.voiceChannelId);
  }

  const settings = getAiSettings();
  const pcm = await synthesizeSpeech(trimmed, settings);
  await player.playAnnouncement(pcm);
}

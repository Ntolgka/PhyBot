import { AppError } from '../core/errors.js';
import { playerManager } from '../music/manager.js';
import { join } from '../music/service.js';
import { getAiSettings } from './settings.js';
import { synthesizeSpeech } from './tts/index.js';

export interface SpeakParams {
  guildId: string;
  text: string;
  voiceChannelId?: string;
  /** Registry id of the voice to speak with; the default voice is used when absent. */
  voiceId?: number;
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
  // A named channel is where the speech belongs, so the bot moves there even
  // when it is already connected somewhere else. Without this an arrival
  // announcement was spoken into whichever channel the bot happened to sit in.
  if (params.voiceChannelId && player?.channelId !== params.voiceChannelId) {
    player = await join(params.guildId, params.voiceChannelId);
  }
  if (!player) {
    throw new AppError(
      'no_voice_channel',
      'Konusmak icin once bir ses kanalina katilmam gerekiyor',
      400,
    );
  }

  const settings = getAiSettings();
  const pcm = await synthesizeSpeech(trimmed, settings, params.voiceId);
  await player.playAnnouncement(pcm);
}

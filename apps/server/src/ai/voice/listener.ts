import { EndBehaviorType, type VoiceConnection } from '@discordjs/voice';
import prism from 'prism-media';
import { truncate } from '@phybot/shared';
import { bus } from '../../core/bus.js';
import { createLogger } from '../../core/logger.js';
import { downmixForSpeech, pcmToWav } from '../../music/audioStream.js';
import type { GuildPlayer } from '../../music/player.js';
import { runChat } from '../assistant.js';
import { createSttProvider, sttAvailable } from '../providers/index.js';
import { getAiSettings } from '../settings.js';
import { speak } from '../speak.js';
import { addListeningGuild, getAiStatus, removeListeningGuild } from '../status.js';
import { STATE_KEYS, stateRepository } from '../../db/repositories/state.js';
import { matchesWakeWord } from './wakeWord.js';

const log = createLogger('ai:listener');

/** 48 kHz, 16-bit, stereo - the PCM format prism-media's opus decoder produces. */
const BYTES_PER_SECOND = 48_000 * 2 * 2;
const MIN_UTTERANCE_BYTES = Math.floor(BYTES_PER_SECOND * 0.6);
const MAX_UTTERANCE_BYTES = BYTES_PER_SECOND * 20;
const SILENCE_DURATION_MS = 800;
/**
 * Every utterance in the channel has to be transcribed to find out whether it
 * contained the wake word, so a lively conversation can burn through a free
 * speech-to-text tier in a minute. A per-guild budget keeps the quota usable.
 */
const STT_BUDGET_PER_MINUTE = 15;
const STT_WINDOW_MS = 60_000;

interface ActiveListener {
  guildId: string;
  connection: VoiceConnection;
  player: GuildPlayer;
  cleanupFns: (() => void)[];
}

const active = new Map<string, ActiveListener>();

/**
 * Listening used to live only in memory, so every restart silently switched it
 * off and the bot looked like it had stopped responding. The sessions are
 * remembered instead and resumed once the bot is back.
 */
interface StoredSession {
  guildId: string;
  voiceChannelId: string;
}

function rememberSession(guildId: string, voiceChannelId: string): void {
  const sessions = stateRepository.get<StoredSession[]>(STATE_KEYS.aiListening, []);
  const next = sessions.filter((entry) => entry.guildId !== guildId);
  next.push({ guildId, voiceChannelId });
  stateRepository.set(STATE_KEYS.aiListening, next);
}

function forgetSession(guildId: string): void {
  const sessions = stateRepository.get<StoredSession[]>(STATE_KEYS.aiListening, []);
  stateRepository.set(
    STATE_KEYS.aiListening,
    sessions.filter((entry) => entry.guildId !== guildId),
  );
}

/** Sessions to restore after a restart. */
export function storedListeningSessions(): StoredSession[] {
  return stateRepository.get<StoredSession[]>(STATE_KEYS.aiListening, []);
}
/** Timestamps of recent speech-to-text requests, per guild. */
const sttCalls = new Map<string, number[]>();
/** Speakers with a transcription in flight, so one person cannot queue up many. */
const transcribing = new Set<string>();

function speakerKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

/**
 * Records a speech-to-text request against the guild budget and reports whether
 * it fits.
 */
function claimSttBudget(guildId: string): boolean {
  const now = Date.now();
  const recent = (sttCalls.get(guildId) ?? []).filter((at) => now - at < STT_WINDOW_MS);
  if (recent.length >= STT_BUDGET_PER_MINUTE) {
    sttCalls.set(guildId, recent);
    return false;
  }
  recent.push(now);
  sttCalls.set(guildId, recent);
  return true;
}

export interface StartListeningParams {
  guildId: string;
  connection: VoiceConnection;
  player: GuildPlayer;
}

/** Starts capturing speech in a guild's voice channel; replaces any prior session for that guild. */
export function startListening(params: StartListeningParams): void {
  stopListening(params.guildId);

  const entry: ActiveListener = {
    guildId: params.guildId,
    connection: params.connection,
    player: params.player,
    cleanupFns: [],
  };
  active.set(params.guildId, entry);

  const onSpeakingStart = (userId: string): void => handleSpeakingStart(entry, userId);
  params.connection.receiver.speaking.on('start', onSpeakingStart);
  entry.cleanupFns.push(() => params.connection.receiver.speaking.off('start', onSpeakingStart));

  const onDestroyed = (): void => stopListening(params.guildId);
  params.player.once('destroyed', onDestroyed);
  entry.cleanupFns.push(() => params.player.off('destroyed', onDestroyed));

  rememberSession(params.guildId, params.player.channelId);
  addListeningGuild(params.guildId);
  bus.emit('ai:status', getAiStatus());
}

/**
 * Stops capturing speech in a guild, whether requested explicitly or because
 * the underlying player went away (idle timeout, disconnect, `stopAll`).
 */
export function stopListening(guildId: string, options: { remember?: boolean } = {}): void {
  if (!options.remember) forgetSession(guildId);
  const entry = active.get(guildId);
  if (!entry) return;
  active.delete(guildId);
  for (const cleanup of entry.cleanupFns) cleanup();
  for (const key of [...transcribing]) {
    if (key.startsWith(`${guildId}:`)) transcribing.delete(key);
  }
  sttCalls.delete(guildId);
  removeListeningGuild(guildId);
  bus.emit('ai:status', getAiStatus());
}

/** Used on shutdown: tears the sessions down but keeps them for the restart. */
export function stopAllListening(): void {
  for (const guildId of [...active.keys()]) stopListening(guildId, { remember: true });
}

function handleSpeakingStart(entry: ActiveListener, userId: string): void {
  if (!active.has(entry.guildId)) return;
  const member = entry.player.guild.members.cache.get(userId);
  if (member?.user.bot) return;

  const opusStream = entry.connection.receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_DURATION_MS },
  });
  const decoder = new prism.opus.Decoder({ rate: 48_000, channels: 2, frameSize: 960 });

  const chunks: Buffer[] = [];
  let byteLength = 0;
  let overflowed = false;

  const onData = (chunk: Buffer): void => {
    byteLength += chunk.length;
    if (byteLength > MAX_UTTERANCE_BYTES) {
      overflowed = true;
      opusStream.destroy();
      return;
    }
    chunks.push(chunk);
  };
  decoder.on('data', onData);
  decoder.on('error', (error: Error) => {
    log.debug({ err: error, guildId: entry.guildId }, 'Opus decode error');
  });

  opusStream.pipe(decoder);

  const finalize = (): void => {
    decoder.destroy();
    if (!opusStream.destroyed) opusStream.destroy();
    if (overflowed) return;
    const pcm = Buffer.concat(chunks);
    if (pcm.length < MIN_UTTERANCE_BYTES) return;
    void processUtterance(entry, userId, pcm);
  };

  opusStream.once('end', finalize);
  opusStream.once('error', (error: Error) => {
    log.debug({ err: error, guildId: entry.guildId }, 'Voice receive stream error');
    finalize();
  });
}

async function processUtterance(entry: ActiveListener, userId: string, pcm: Buffer): Promise<void> {
  const settings = getAiSettings();
  if (settings.sttProvider === 'none' || !getAiStatus().sttReady) return;

  const key = speakerKey(entry.guildId, userId);

  // One request per speaker at a time, otherwise a long monologue arrives as a
  // burst of overlapping uploads.
  if (transcribing.has(key)) return;
  if (!sttAvailable(settings)) {
    log.debug({ guildId: entry.guildId }, 'Skipped an utterance: every provider is rate limited');
    return;
  }
  if (!claimSttBudget(entry.guildId)) {
    log.debug({ guildId: entry.guildId }, 'Skipped an utterance: guild speech budget spent');
    return;
  }

  let transcript: string;
  transcribing.add(key);
  try {
    const transcriber = createSttProvider(settings);
    transcript = await transcriber.transcribe({
      // Speech recognition works on 16 kHz mono, so sending Discord's 48 kHz
      // stereo would only upload six times the bytes for the same words.
      wav: pcmToWav(downmixForSpeech(pcm), 16_000, 1),
      language: settings.language,
    });
  } catch (error) {
    log.warn({ err: error, guildId: entry.guildId }, 'Speech-to-text request failed');
    return;
  } finally {
    transcribing.delete(key);
  }
  if (!transcript.trim()) return;

  const match = matchesWakeWord(transcript, settings.wakeWord);

  // Saying the wake word while the assistant is talking cuts it off, the way
  // you can talk over a phone assistant.
  if (match.matched && entry.player.isSpeaking) {
    entry.player.interruptAnnouncement();
    log.debug({ guildId: entry.guildId }, 'Spoken reply interrupted by the wake word');
  }

  // The wake word and the request have to arrive together. Anything else in the
  // channel is conversation between people, and the assistant stays out of it
  // rather than answering whatever was said near it.
  if (!match.matched) {
    // Without this line a wake word that speech recognition mangles looks
    // exactly like the bot being broken.
    log.info(
      { guildId: entry.guildId, wakeWord: settings.wakeWord },
      `Heard "${truncate(transcript.trim(), 120)}" but the wake word did not match`,
    );
    return;
  }
  const message = match.rest.trim();
  if (!message) {
    log.info(
      { guildId: entry.guildId },
      'The wake word was heard on its own; say it together with the request',
    );
    return;
  }

  const member = entry.player.guild.members.cache.get(userId);
  const userName = member?.displayName ?? member?.user.username ?? 'Discord user';

  let reply: string;
  try {
    reply = await runChat(
      {
        message,
        userId,
        userName,
        guildId: entry.guildId,
        channelId: entry.player.channelId,
      },
      settings,
      getAiStatus().textReady,
    );
  } catch (error) {
    log.warn({ err: error, guildId: entry.guildId }, 'Assistant failed to handle a voice command');
    return;
  }

  if (!settings.speakReplies) return;

  try {
    await speak({ guildId: entry.guildId, text: reply });
  } catch (error) {
    log.warn({ err: error, guildId: entry.guildId }, 'Failed to speak the assistant reply');
  }
  // Nothing is remembered about this speaker: the next request needs the wake
  // word again, so the assistant goes quiet as soon as it has answered.
}

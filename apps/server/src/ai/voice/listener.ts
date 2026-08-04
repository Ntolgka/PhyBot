import { EndBehaviorType, type VoiceConnection } from '@discordjs/voice';
import prism from 'prism-media';
import { bus } from '../../core/bus.js';
import { createLogger } from '../../core/logger.js';
import { pcmToWav } from '../../music/audioStream.js';
import type { GuildPlayer } from '../../music/player.js';
import { runChat } from '../assistant.js';
import { createSttProvider } from '../providers/index.js';
import { getAiSettings } from '../settings.js';
import { speak } from '../speak.js';
import { addListeningGuild, getAiStatus, removeListeningGuild } from '../status.js';
import { matchesWakeWord } from './wakeWord.js';

const log = createLogger('ai:listener');

/** 48 kHz, 16-bit, stereo - the PCM format prism-media's opus decoder produces. */
const BYTES_PER_SECOND = 48_000 * 2 * 2;
const MIN_UTTERANCE_BYTES = Math.floor(BYTES_PER_SECOND * 0.6);
const MAX_UTTERANCE_BYTES = BYTES_PER_SECOND * 20;
const SILENCE_DURATION_MS = 800;
/**
 * After the assistant answers someone, that person can keep talking for a
 * short while without repeating the wake word, the way a phone assistant stays
 * open for a follow up question.
 */
const FOLLOW_UP_WINDOW_MS = 15_000;

interface ActiveListener {
  guildId: string;
  connection: VoiceConnection;
  player: GuildPlayer;
  cleanupFns: (() => void)[];
}

const active = new Map<string, ActiveListener>();
/** `guildId:userId` -> timestamp until which the wake word may be skipped. */
const followUpUntil = new Map<string, number>();

function followUpKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
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

  addListeningGuild(params.guildId);
  bus.emit('ai:status', getAiStatus());
}

/**
 * Stops capturing speech in a guild, whether requested explicitly or because
 * the underlying player went away (idle timeout, disconnect, `stopAll`).
 */
export function stopListening(guildId: string): void {
  const entry = active.get(guildId);
  if (!entry) return;
  active.delete(guildId);
  for (const cleanup of entry.cleanupFns) cleanup();
  for (const key of [...followUpUntil.keys()]) {
    if (key.startsWith(`${guildId}:`)) followUpUntil.delete(key);
  }
  removeListeningGuild(guildId);
  bus.emit('ai:status', getAiStatus());
}

export function stopAllListening(): void {
  for (const guildId of [...active.keys()]) stopListening(guildId);
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

  let transcript: string;
  try {
    const transcriber = createSttProvider(settings);
    transcript = await transcriber.transcribe({
      wav: pcmToWav(pcm, 48_000, 2),
      language: settings.language,
    });
  } catch (error) {
    log.warn({ err: error, guildId: entry.guildId }, 'Speech-to-text request failed');
    return;
  }
  if (!transcript.trim()) return;

  const key = followUpKey(entry.guildId, userId);
  const inFollowUp = (followUpUntil.get(key) ?? 0) > Date.now();
  const match = matchesWakeWord(transcript, settings.wakeWord);

  // Saying the wake word while the assistant is talking cuts it off, the way
  // you can talk over a phone assistant.
  if (match.matched && entry.player.isSpeaking) {
    entry.player.interruptAnnouncement();
    log.debug({ guildId: entry.guildId }, 'Spoken reply interrupted by the wake word');
  }

  // The wake word always works; right after a reply the same speaker may also
  // continue without it.
  const message = match.matched && match.rest ? match.rest : inFollowUp ? transcript.trim() : '';
  if (!message) return;
  followUpUntil.delete(key);

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

  if (!settings.speakReplies) {
    followUpUntil.set(key, Date.now() + FOLLOW_UP_WINDOW_MS);
    return;
  }

  try {
    await speak({ guildId: entry.guildId, text: reply });
  } catch (error) {
    log.warn({ err: error, guildId: entry.guildId }, 'Failed to speak the assistant reply');
  } finally {
    // Measured from the end of the reply, so the window covers thinking time.
    followUpUntil.set(key, Date.now() + FOLLOW_UP_WINDOW_MS);
  }
}

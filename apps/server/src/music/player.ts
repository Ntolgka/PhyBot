import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type AudioResource,
  type VoiceConnection,
} from '@discordjs/voice';
import type { Guild, VoiceBasedChannel } from 'discord.js';
import type { LoopMode, PlayerSnapshot, PlayerStatus, Track } from '@phybot/shared';
import { MAX_VOLUME, MIN_VOLUME, clamp, totalDuration } from '@phybot/shared';
import { createLogger } from '../core/logger.js';
import { toErrorMessage } from '../core/errors.js';
import { createPcmStream, type FfmpegStream } from './audioStream.js';
import { TrackQueue } from './queue.js';
import { findRelatedTrack, resolvePlayableCandidates } from './resolver.js';
import { fetchPlaybackInfo, invalidatePlayback } from './ytdlp.js';

const log = createLogger('player');

/** Alternative uploads tried when the first match will not play. */
const MAX_SOURCE_ATTEMPTS = 3;

export interface GuildPlayerEvents {
  trackStart: [Track];
  trackEnd: [Track];
  queueEnd: [];
  /**
   * Deliberately not called 'error'. Node treats an 'error' event with no
   * listener as a fatal unhandled error, so a failed track used to crash the
   * command that queued it instead of skipping to the next one.
   */
  playbackError: [string];
  update: [];
  destroyed: [];
}

export interface GuildPlayerOptions {
  guild: Guild;
  voiceChannel: VoiceBasedChannel;
  textChannelId: string | null;
  volume: number;
  idleTimeoutSeconds: number;
}

export class GuildPlayer extends EventEmitter<GuildPlayerEvents> {
  readonly guild: Guild;
  readonly queue = new TrackQueue();

  private connection: VoiceConnection | null = null;
  private readonly audioPlayer: AudioPlayer;
  private resource: AudioResource | null = null;
  private stream: FfmpegStream | null = null;

  private voiceChannelId: string;
  private voiceChannelName: string;
  textChannelId: string | null;

  private volumePercent: number;
  private idleTimeoutSeconds: number;
  private autoplayEnabled = false;

  /** Offset applied after a seek, in seconds. */
  private startOffset = 0;
  private status: PlayerStatus = 'idle';
  /** Set while stopping the audio player on purpose so idle is not treated as track end. */
  private transitioning = false;
  private destroyed = false;
  private emptySince: number | null = null;
  /** Last track autoplay used as a seed, kept when the history is trimmed. */
  private lastSeed: Track | null = null;
  /** Set while an assistant reply is being spoken, so it can be interrupted. */
  private speechPlayer: AudioPlayer | null = null;
  private readonly idleTimer: NodeJS.Timeout;
  private tickTimer: NodeJS.Timeout | null = null;
  private lastError: string | null = null;

  constructor(options: GuildPlayerOptions) {
    super();
    this.guild = options.guild;
    this.voiceChannelId = options.voiceChannel.id;
    this.voiceChannelName = options.voiceChannel.name;
    this.textChannelId = options.textChannelId;
    this.volumePercent = clamp(options.volume, MIN_VOLUME, MAX_VOLUME);
    this.idleTimeoutSeconds = options.idleTimeoutSeconds;

    this.audioPlayer = createAudioPlayer({
      behaviors: { maxMissedFrames: 50 },
    });
    this.registerPlayerEvents();
    this.connect(options.voiceChannel);

    this.idleTimer = setInterval(() => this.checkIdle(), 15_000);
  }

  // -- connection ----------------------------------------------------------

  connect(channel: VoiceBasedChannel): void {
    this.voiceChannelId = channel.id;
    this.voiceChannelName = channel.name;

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      void this.handleDisconnect(connection);
    });
    connection.on('error', (error) => {
      log.warn({ err: error, guildId: this.guild.id }, 'Voice connection error');
    });

    connection.subscribe(this.audioPlayer);
    this.connection = connection;
    this.emitUpdate();
  }

  private async handleDisconnect(connection: VoiceConnection): Promise<void> {
    try {
      // A move between channels looks like a disconnect; wait for a reconnect.
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      log.info({ guildId: this.guild.id }, 'Voice connection lost, cleaning up');
      this.destroy();
    }
  }

  /** Waits until the voice connection is usable. */
  async waitUntilReady(timeoutMs = 20_000): Promise<void> {
    if (!this.connection) throw new Error('Not connected to a voice channel');
    await entersState(this.connection, VoiceConnectionStatus.Ready, timeoutMs);
  }

  get voiceConnection(): VoiceConnection | null {
    return this.connection;
  }

  get channelId(): string {
    return this.voiceChannelId;
  }

  // -- playback ------------------------------------------------------------

  private registerPlayerEvents(): void {
    this.audioPlayer.on(AudioPlayerStatus.Playing, () => {
      this.setStatus('playing');
    });
    this.audioPlayer.on(AudioPlayerStatus.Paused, () => this.setStatus('paused'));
    this.audioPlayer.on(AudioPlayerStatus.AutoPaused, () => this.setStatus('paused'));
    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      if (this.transitioning || this.destroyed) return;
      const finished = this.queue.current;
      if (finished) this.emit('trackEnd', finished);
      void this.advance();
    });
    this.audioPlayer.on('error', (error) => {
      log.warn({ err: error, guildId: this.guild.id }, 'Audio player error');
      this.lastError = toErrorMessage(error);
      if (this.transitioning || this.destroyed) return;
      void this.advance();
    });
  }

  private setStatus(status: PlayerStatus): void {
    if (this.status === status) return;
    this.status = status;
    if (status === 'playing') this.startTicking();
    else this.stopTicking();
    this.emitUpdate();
  }

  /** Pushes periodic snapshots so the dashboard progress bar stays in sync. */
  private startTicking(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.emitUpdate(), 3000);
  }

  private stopTicking(): void {
    if (!this.tickTimer) return;
    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  /** Adds tracks and starts playback when nothing is playing yet. */
  async enqueue(
    tracks: Track[],
    options: { next?: boolean } = {},
  ): Promise<{ added: number; rejected: number }> {
    const result = this.queue.add(tracks, options);
    if (!this.queue.current && result.added > 0) {
      await this.advance();
    } else {
      this.emitUpdate();
    }
    return result;
  }

  /** Moves to the next track, or ends the session when nothing is left. */
  private async advance(options: { force?: boolean } = {}): Promise<void> {
    if (this.destroyed) return;
    const next = this.queue.next(options);

    if (!next) {
      if (this.autoplayEnabled) {
        // Seed from the track that just finished so the radio keeps drifting
        // with what was actually played rather than the original request.
        const seed = this.queue.history[0] ?? this.lastSeed;
        if (seed) {
          this.lastSeed = seed;
          const related = await findRelatedTrack(seed, this.queue.knownUrls(), {
            requestedBy: seed.requestedBy,
            requestedByName: 'Autoplay',
          });
          if (related) {
            this.queue.add([related]);
            await this.advance();
            return;
          }
          log.info(
            { guildId: this.guild.id, seed: seed.title },
            'Autoplay found no similar track, stopping',
          );
        }
      }
      // Skipping the last track leaves ffmpeg still feeding the connection, so
      // the audio carried on playing while the queue reported itself empty.
      // Reaching the end naturally is harmless here because the stream has
      // already finished, and stopStream guards the idle handler either way.
      this.stopStream();
      this.setStatus('idle');
      this.emit('queueEnd');
      this.emitUpdate();
      return;
    }

    await this.startTrack(next, 0);
  }

  private async startTrack(track: Track, seekSeconds: number): Promise<void> {
    this.stopStream();
    this.setStatus('loading');
    this.startOffset = seekSeconds;

    let lastError = 'No playable source was found';
    try {
      for (const [index, url] of (await this.startPlan(track)).entries()) {
        try {
          await this.playFrom(track, url, seekSeconds);
          return;
        } catch (error) {
          lastError = toErrorMessage(error);
          log.warn(
            { err: error, guildId: this.guild.id, track: track.title, attempt: index + 1 },
            'Failed to start track',
          );
          // Whether the media URL expired or the upload is gated, the cached
          // entry is no use to the next attempt.
          invalidatePlayback(url);
        }
      }
    } catch (error) {
      lastError = toErrorMessage(error);
      log.warn({ err: error, guildId: this.guild.id, track: track.title }, 'Failed to start track');
    }

    this.lastError = lastError;
    this.emit('playbackError', `${track.title}: ${lastError}`);
    await this.advance({ force: true });
  }

  /**
   * The URLs to try, in order.
   *
   * The first choice gets a second go, which is what recovers from a signed
   * media URL that expired while the track sat in the queue. After that come
   * the other matches for the same song, so a YouTube upload that demands a
   * sign-in is stepped over rather than killing the track.
   */
  private async startPlan(track: Track): Promise<string[]> {
    const candidates = (await resolvePlayableCandidates(track)).slice(0, MAX_SOURCE_ATTEMPTS);
    const [first] = candidates;
    return first ? [first, ...candidates] : [];
  }

  /** Opens one source and hands it to the voice connection. */
  private async playFrom(track: Track, url: string, seekSeconds: number): Promise<void> {
    const info = await fetchPlaybackInfo(url);
    if (info.duration > 0 && track.duration === 0) track.duration = info.duration;
    if (info.isLive) track.isLive = true;

    const stream = createPcmStream({ url: info.streamUrl, headers: info.headers, seekSeconds });
    this.stream = stream;

    const resource = createAudioResource(stream.output, {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });
    resource.volume?.setVolume(this.volumePercent / 100);
    this.resource = resource;

    this.transitioning = false;
    this.audioPlayer.play(resource);
    this.lastError = null;
    this.emit('trackStart', track);
    this.emitUpdate();
  }

  private stopStream(): void {
    this.transitioning = true;
    try {
      this.audioPlayer.stop(true);
    } catch {
      // The player may already be idle.
    }
    this.stream?.destroy();
    this.stream = null;
    this.resource = null;
    this.transitioning = false;
  }

  // -- controls ------------------------------------------------------------

  pause(): boolean {
    if (this.status !== 'playing') return false;
    const paused = this.audioPlayer.pause(true);
    if (paused) this.setStatus('paused');
    return paused;
  }

  resume(): boolean {
    if (this.status !== 'paused') return false;
    const resumed = this.audioPlayer.unpause();
    if (resumed) this.setStatus('playing');
    return resumed;
  }

  togglePause(): PlayerStatus {
    if (this.status === 'playing') this.pause();
    else if (this.status === 'paused') this.resume();
    return this.status;
  }

  async skip(count = 1): Promise<Track | null> {
    for (let i = 0; i < Math.max(1, count) - 1; i += 1) {
      this.queue.next({ force: true });
    }
    await this.advance({ force: true });
    return this.queue.current;
  }

  async previous(): Promise<Track | null> {
    const previous = this.queue.previous();
    if (!previous) return null;
    await this.startTrack(previous, 0);
    return previous;
  }

  /** Restarts the current track from the beginning. */
  async restart(): Promise<Track | null> {
    const current = this.queue.current;
    if (!current) return null;
    await this.startTrack(current, 0);
    return current;
  }

  async jumpTo(index: number): Promise<Track | null> {
    const target = this.queue.jumpTo(index);
    if (!target) return null;
    await this.startTrack(target, 0);
    return target;
  }

  /**
   * Plays the chosen queue positions now, in the order they were picked, and
   * leaves the rest of the queue behind them.
   *
   * Unlike jumping to a position this throws nothing away: picking 23 does not
   * mark 1 to 22 as played, it just moves 23 to the front. Positions are read
   * against the queue as it currently stands, which is the same order the list
   * is numbered in, so mixing beforehand does not change what a number means.
   */
  async playSelection(indices: number[]): Promise<Track | null> {
    const wanted = [...new Set(indices)].filter(
      (index) => index >= 0 && index < this.queue.tracks.length,
    );
    if (wanted.length === 0) return null;

    // Removing from the back keeps the lower indices pointing at the same
    // tracks while the list shrinks underneath.
    const removed = new Map<number, Track>();
    for (const index of [...wanted].sort((a, b) => b - a)) {
      const track = this.queue.removeAt(index);
      if (track) removed.set(index, track);
    }

    const picked = wanted
      .map((index) => removed.get(index))
      .filter((track): track is Track => track !== undefined);
    if (picked.length === 0) return null;

    this.queue.add(picked, { next: true });
    await this.advance({ force: true });
    return this.queue.current;
  }

  async playTrackNow(track: Track): Promise<void> {
    this.queue.add([track], { next: true });
    await this.advance({ force: true });
  }

  /** Absolute seek in seconds. Live streams cannot be seeked. */
  async seek(seconds: number): Promise<number> {
    const current = this.queue.current;
    if (!current) throw new Error('Nothing is playing');
    if (current.isLive) throw new Error('Live streams cannot be seeked');
    const target = clamp(
      seconds,
      0,
      current.duration > 0 ? Math.max(0, current.duration - 1) : seconds,
    );
    await this.startTrack(current, target);
    return target;
  }

  async seekRelative(delta: number): Promise<number> {
    return this.seek(this.position + delta);
  }

  stop(clearQueue = true): void {
    if (clearQueue) this.queue.clear();
    this.queue.current = null;
    this.stopStream();
    this.setStatus('stopped');
    this.emitUpdate();
  }

  setVolume(percent: number): number {
    this.volumePercent = clamp(Math.round(percent), MIN_VOLUME, MAX_VOLUME);
    this.resource?.volume?.setVolume(this.volumePercent / 100);
    this.emitUpdate();
    return this.volumePercent;
  }

  setLoop(mode: LoopMode): LoopMode {
    this.queue.loop = mode;
    this.emitUpdate();
    return mode;
  }

  setShuffle(enabled: boolean): boolean {
    this.queue.shuffle = enabled;
    this.emitUpdate();
    return enabled;
  }

  /**
   * Mixes the pending queue once. Random order is switched off at the same
   * time, so the freshly mixed order is what actually plays instead of being
   * re-drawn on every skip.
   */
  shuffleQueue(): number {
    const count = this.queue.shuffleAll();
    this.queue.shuffle = false;
    this.emitUpdate();
    return count;
  }

  // Queue mutations go through the player so every listener sees the change.

  removeTrack(trackId: string): Track | null {
    const removed = this.queue.remove(trackId);
    if (removed) this.emitUpdate();
    return removed;
  }

  removeTrackAt(index: number): Track | null {
    const removed = this.queue.removeAt(index);
    if (removed) this.emitUpdate();
    return removed;
  }

  clearQueue(): number {
    const removed = this.queue.clear();
    this.emitUpdate();
    return removed;
  }

  moveTrack(from: number, to: number): boolean {
    const moved = this.queue.move(from, to);
    if (moved) this.emitUpdate();
    return moved;
  }

  dedupeQueue(): number {
    const removed = this.queue.dedupe();
    if (removed > 0) this.emitUpdate();
    return removed;
  }

  setAutoplay(enabled: boolean): boolean {
    this.autoplayEnabled = enabled;
    this.emitUpdate();
    // Switching it on with nothing playing starts the radio straight away.
    if (enabled && !this.queue.current && this.status !== 'loading') {
      void this.advance();
    }
    return enabled;
  }

  get autoplay(): boolean {
    return this.autoplayEnabled;
  }

  get volume(): number {
    return this.volumePercent;
  }

  get position(): number {
    if (!this.resource) return this.startOffset;
    return this.startOffset + this.resource.playbackDuration / 1000;
  }

  get playbackStatus(): PlayerStatus {
    return this.status;
  }

  get error(): string | null {
    return this.lastError;
  }

  setIdleTimeout(seconds: number): void {
    this.idleTimeoutSeconds = seconds;
  }

  setTextChannel(channelId: string | null): void {
    this.textChannelId = channelId;
    this.emitUpdate();
  }

  /**
   * Plays a short PCM clip (assistant speech) over the current connection.
   * Music is paused for the duration and resumed afterwards.
   */
  async playAnnouncement(pcm: Buffer): Promise<void> {
    if (this.destroyed || !this.connection) throw new Error('Not connected to a voice channel');
    // A new reply always replaces one that is still being spoken.
    this.interruptAnnouncement();

    const wasPlaying = this.status === 'playing';
    if (wasPlaying) this.audioPlayer.pause(true);

    const speechPlayer = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });
    this.speechPlayer = speechPlayer;
    const resource = createAudioResource(Readable.from(pcm), { inputType: StreamType.Raw });
    const subscription = this.connection.subscribe(speechPlayer);

    try {
      speechPlayer.play(resource);
      await entersState(speechPlayer, AudioPlayerStatus.Playing, 5_000);
      await entersState(speechPlayer, AudioPlayerStatus.Idle, 120_000);
    } finally {
      speechPlayer.stop(true);
      subscription?.unsubscribe();
      if (this.speechPlayer === speechPlayer) this.speechPlayer = null;
      // Re-subscribing restores music playback on the same connection.
      this.connection?.subscribe(this.audioPlayer);
      if (wasPlaying) this.audioPlayer.unpause();
    }
  }

  /** True while a spoken reply is being played. */
  get isSpeaking(): boolean {
    return this.speechPlayer !== null;
  }

  /**
   * Cuts a spoken reply short, which is what lets the wake word interrupt the
   * assistant mid-sentence. Returns false when nothing was being said.
   */
  interruptAnnouncement(): boolean {
    const speech = this.speechPlayer;
    if (!speech) return false;
    this.speechPlayer = null;
    // Stopping moves the player to Idle, so playAnnouncement's wait resolves
    // and its cleanup restores the music subscription.
    speech.stop(true);
    return true;
  }

  // -- housekeeping --------------------------------------------------------

  /** Leaves the voice channel after being alone for the configured time. */
  private checkIdle(): void {
    if (this.destroyed || this.idleTimeoutSeconds <= 0) return;
    const channel = this.guild.channels.cache.get(this.voiceChannelId);
    const listeners =
      channel && channel.isVoiceBased()
        ? channel.members.filter((member) => !member.user.bot).size
        : 0;

    const idle = listeners === 0 || this.status === 'idle' || this.status === 'stopped';
    if (!idle) {
      this.emptySince = null;
      return;
    }
    this.emptySince ??= Date.now();
    if (Date.now() - this.emptySince >= this.idleTimeoutSeconds * 1000) {
      log.info({ guildId: this.guild.id }, 'Leaving voice channel after inactivity');
      this.destroy();
    }
  }

  snapshot(): PlayerSnapshot {
    const upcoming = [...this.queue.tracks];
    return {
      guildId: this.guild.id,
      guildName: this.guild.name,
      status: this.status,
      current: this.queue.current,
      position: Math.max(0, Math.round(this.position * 10) / 10),
      queue: upcoming,
      history: [...this.queue.history].slice(0, 25),
      volume: this.volumePercent,
      loop: this.queue.loop,
      shuffle: this.queue.shuffle,
      autoplay: this.autoplayEnabled,
      voiceChannelId: this.voiceChannelId,
      voiceChannelName: this.voiceChannelName,
      textChannelId: this.textChannelId,
      queueDuration: totalDuration(upcoming),
      updatedAt: Date.now(),
    };
  }

  private emitUpdate(): void {
    if (this.destroyed) return;
    this.emit('update');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    clearInterval(this.idleTimer);
    this.stopTicking();
    this.stopStream();
    try {
      this.audioPlayer.stop(true);
    } catch {
      // Already stopped.
    }
    try {
      this.connection?.destroy();
    } catch {
      // The connection may already be gone.
    }
    this.connection = null;
    this.status = 'idle';
    this.emit('destroyed');
    this.removeAllListeners();
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }
}

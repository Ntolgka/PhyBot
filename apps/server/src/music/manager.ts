import { EventEmitter } from 'node:events';
import type { Guild, VoiceBasedChannel } from 'discord.js';
import type { PlayerSnapshot, Track } from '@phybot/shared';
import { bus } from '../core/bus.js';
import { createLogger } from '../core/logger.js';
import { historyRepository } from '../db/repositories/misc.js';
import { settingsRepository } from '../db/repositories/settings.js';
import { GuildPlayer } from './player.js';

const log = createLogger('music');

export interface PlayerManagerEvents {
  trackStart: [{ guildId: string; track: Track }];
  trackEnd: [{ guildId: string; track: Track }];
  queueEnd: [{ guildId: string }];
  error: [{ guildId: string; message: string }];
  created: [{ guildId: string }];
  destroyed: [{ guildId: string }];
}

/** Owns one GuildPlayer per guild and republishes their events. */
class PlayerManager extends EventEmitter<PlayerManagerEvents> {
  private readonly players = new Map<string, GuildPlayer>();

  get(guildId: string): GuildPlayer | null {
    const player = this.players.get(guildId);
    if (player?.isDestroyed) {
      this.players.delete(guildId);
      return null;
    }
    return player ?? null;
  }

  has(guildId: string): boolean {
    return this.get(guildId) !== null;
  }

  list(): GuildPlayer[] {
    return [...this.players.values()].filter((player) => !player.isDestroyed);
  }

  snapshots(): PlayerSnapshot[] {
    return this.list().map((player) => player.snapshot());
  }

  /** Returns the existing player, joining the given channel when needed. */
  async join(
    guild: Guild,
    voiceChannel: VoiceBasedChannel,
    textChannelId: string | null,
  ): Promise<GuildPlayer> {
    const existing = this.get(guild.id);
    if (existing) {
      if (existing.channelId !== voiceChannel.id) existing.connect(voiceChannel);
      if (textChannelId) existing.setTextChannel(textChannelId);
      return existing;
    }

    const settings = settingsRepository.get(guild.id);
    const player = new GuildPlayer({
      guild,
      voiceChannel,
      textChannelId: textChannelId ?? settings.musicTextChannelId,
      volume: settings.defaultVolume,
      idleTimeoutSeconds: settings.idleTimeoutSeconds,
    });

    this.players.set(guild.id, player);
    this.wire(guild.id, player);

    try {
      await player.waitUntilReady();
    } catch (error) {
      player.destroy();
      this.players.delete(guild.id);
      throw new Error(
        'Could not connect to the voice channel. Check that the bot may connect and speak there.',
      );
    }

    this.emit('created', { guildId: guild.id });
    bus.emit('player:update', player.snapshot());
    return player;
  }

  private wire(guildId: string, player: GuildPlayer): void {
    player.on('update', () => {
      if (player.isDestroyed) return;
      bus.emit('player:update', player.snapshot());
    });
    player.on('trackStart', (track) => {
      historyRepository.add(guildId, track);
      this.emit('trackStart', { guildId, track });
    });
    player.on('trackEnd', (track) => this.emit('trackEnd', { guildId, track }));
    player.on('queueEnd', () => this.emit('queueEnd', { guildId }));
    player.on('error', (message) => {
      log.warn({ guildId, message }, 'Playback error');
      this.emit('error', { guildId, message });
    });
    player.on('destroyed', () => {
      this.players.delete(guildId);
      bus.emit('player:removed', { guildId });
      this.emit('destroyed', { guildId });
    });
  }

  destroy(guildId: string): boolean {
    const player = this.get(guildId);
    if (!player) return false;
    player.destroy();
    this.players.delete(guildId);
    return true;
  }

  destroyAll(): void {
    for (const player of this.list()) player.destroy();
    this.players.clear();
  }
}

export const playerManager = new PlayerManager();

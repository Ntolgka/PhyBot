import { ChannelType, PermissionsBitField, type Guild, type VoiceBasedChannel } from 'discord.js';
import type { ResolvedRequest, Track } from '@phybot/shared';
import { MAX_PLAYLIST_IMPORT, shuffled } from '@phybot/shared';
import { AppError, NotFoundError } from '../core/errors.js';
import { collectionsRepository } from '../db/repositories/misc.js';
import { getClient } from '../discord/client.js';
import { playerManager } from './manager.js';
import type { GuildPlayer } from './player.js';
import { resolveQuery } from './resolver.js';

export interface Requester {
  id: string;
  name: string;
}

export interface PlayParams {
  guildId: string;
  query: string;
  requester: Requester;
  voiceChannelId?: string | undefined;
  textChannelId?: string | undefined;
  next?: boolean | undefined;
  shuffle?: boolean | undefined;
}

export interface PlayResult {
  playlistName: string | null;
  tracks: Track[];
  added: number;
  rejected: number;
  truncated: number;
  /** The source shared only part of the collection (Spotify playlists). */
  partial: boolean;
  /** True when the request started playing immediately. */
  startedNow: boolean;
}

export function getGuild(guildId: string): Guild {
  const guild = getClient().guilds.cache.get(guildId);
  if (!guild) throw new NotFoundError('The bot is not a member of that server');
  return guild;
}

export function getPlayer(guildId: string): GuildPlayer {
  const player = playerManager.get(guildId);
  if (!player) throw new AppError('no_player', 'Nothing is playing in that server', 409);
  return player;
}

function resolveVoiceChannel(guild: Guild, channelId: string): VoiceBasedChannel {
  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isVoiceBased()) {
    throw new NotFoundError('That voice channel does not exist');
  }
  if (channel.type === ChannelType.GuildStageVoice) {
    throw new AppError('unsupported_channel', 'Stage channels are not supported', 400);
  }

  const me = guild.members.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  if (
    !permissions?.has(PermissionsBitField.Flags.ViewChannel) ||
    !permissions.has(PermissionsBitField.Flags.Connect) ||
    !permissions.has(PermissionsBitField.Flags.Speak)
  ) {
    throw new AppError(
      'missing_permissions',
      `The bot needs View Channel, Connect and Speak permissions in "${channel.name}"`,
      403,
    );
  }
  if (
    channel.userLimit > 0 &&
    channel.members.size >= channel.userLimit &&
    !permissions.has(PermissionsBitField.Flags.MoveMembers)
  ) {
    throw new AppError('channel_full', `"${channel.name}" is full`, 409);
  }
  return channel;
}

/** Resolves a request and queues it, joining the voice channel when needed. */
export async function play(params: PlayParams): Promise<PlayResult> {
  const guild = getGuild(params.guildId);
  const existing = playerManager.get(params.guildId);

  const targetChannelId = params.voiceChannelId ?? existing?.channelId;
  if (!targetChannelId) {
    throw new AppError(
      'no_voice_channel',
      'Join a voice channel first, or pick one to play in',
      400,
    );
  }
  const voiceChannel = resolveVoiceChannel(guild, targetChannelId);

  const resolved: ResolvedRequest = await resolveQuery(params.query, {
    requestedBy: params.requester.id,
    requestedByName: params.requester.name,
    limit: MAX_PLAYLIST_IMPORT,
  });

  const tracks = params.shuffle ? shuffled(resolved.tracks) : resolved.tracks;

  // A collection is recorded only for a genuine multi track import. A search
  // that happens to report a playlist name, or a link to one song inside a
  // playlist, is a single song and gets its own card like any other.
  if (resolved.playlistName && tracks.length > 1) {
    const collectionId = collectionsRepository.add(
      params.guildId,
      params.query,
      resolved.playlistName,
      tracks.length,
    );
    for (const track of tracks) track.collectionId = collectionId;
  }

  const player = await playerManager.join(guild, voiceChannel, params.textChannelId ?? null);
  const wasIdle = player.queue.current === null;
  const result = await player.enqueue(tracks, { next: params.next ?? false });

  return {
    playlistName: resolved.playlistName,
    tracks,
    added: result.added,
    rejected: result.rejected,
    truncated: resolved.truncated,
    partial: resolved.partial === true,
    startedNow: wasIdle,
  };
}

/** Ensures the bot is connected without queueing anything. */
export async function join(
  guildId: string,
  voiceChannelId: string,
  textChannelId?: string,
): Promise<GuildPlayer> {
  const guild = getGuild(guildId);
  const channel = resolveVoiceChannel(guild, voiceChannelId);
  return playerManager.join(guild, channel, textChannelId ?? null);
}

export function leave(guildId: string): boolean {
  return playerManager.destroy(guildId);
}

import type { FastifyInstance } from 'fastify';
import {
  jumpSchema,
  joinSchema,
  loopSchema,
  playRequestSchema,
  queueMoveSchema,
  seekRelativeSchema,
  seekSchema,
  toggleSchema,
  volumeSchema,
  type PlayerSnapshot,
} from '@phybot/shared';
import { AppError, NotFoundError } from '../../core/errors.js';
import { historyRepository } from '../../db/repositories/misc.js';
import { playerManager } from '../../music/manager.js';
import { searchTracks } from '../../music/resolver.js';
import { getPlayer, join, leave, play } from '../../music/service.js';
import { parseBody } from '../validation.js';

function snapshot(guildId: string): PlayerSnapshot {
  return getPlayer(guildId).snapshot();
}

export async function musicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/music/search', async (request) => {
    const { q, limit } = request.query as { q?: string; limit?: string };
    if (!q || q.trim().length === 0) return [];
    return searchTracks(q, Math.min(Number(limit ?? 8) || 8, 20));
  });

  app.get('/guilds/:guildId/player', async (request) => {
    const { guildId } = request.params as { guildId: string };
    return playerManager.get(guildId)?.snapshot() ?? null;
  });

  app.post('/guilds/:guildId/player/play', async (request) => {
    const { guildId } = request.params as { guildId: string };
    const body = parseBody(playRequestSchema, request.body);
    const result = await play({
      guildId,
      query: body.query,
      requester: { id: 'dashboard', name: 'Dashboard' },
      voiceChannelId: body.voiceChannelId,
      textChannelId: body.textChannelId,
      next: body.next,
      shuffle: body.shuffle,
    });
    return {
      playlistName: result.playlistName,
      added: result.added,
      rejected: result.rejected,
      truncated: result.truncated,
      partial: result.partial,
      tracks: result.tracks,
    };
  });

  app.post('/guilds/:guildId/player/join', async (request) => {
    const { guildId } = request.params as { guildId: string };
    const body = parseBody(joinSchema, request.body);
    const player = await join(guildId, body.voiceChannelId, body.textChannelId);
    return player.snapshot();
  });

  app.post('/guilds/:guildId/player/leave', async (request) => {
    const { guildId } = request.params as { guildId: string };
    if (!leave(guildId)) throw new NotFoundError('The bot is not in a voice channel there');
    return { ok: true };
  });

  app.post('/guilds/:guildId/player/pause', async (request) => {
    const { guildId } = request.params as { guildId: string };
    getPlayer(guildId).pause();
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/resume', async (request) => {
    const { guildId } = request.params as { guildId: string };
    getPlayer(guildId).resume();
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/toggle', async (request) => {
    const { guildId } = request.params as { guildId: string };
    getPlayer(guildId).togglePause();
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/skip', async (request) => {
    const { guildId } = request.params as { guildId: string };
    const { count } = (request.body ?? {}) as { count?: number };
    await getPlayer(guildId).skip(Math.min(Math.max(count ?? 1, 1), 50));
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/previous', async (request) => {
    const { guildId } = request.params as { guildId: string };
    const track = await getPlayer(guildId).previous();
    if (!track) throw new AppError('no_history', 'There is no previous track', 409);
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/restart', async (request) => {
    const { guildId } = request.params as { guildId: string };
    await getPlayer(guildId).restart();
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/stop', async (request) => {
    const { guildId } = request.params as { guildId: string };
    getPlayer(guildId).stop(true);
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/seek', async (request) => {
    const { guildId } = request.params as { guildId: string };
    const body = parseBody(seekSchema, request.body);
    await getPlayer(guildId).seek(body.position);
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/seek-relative', async (request) => {
    const { guildId } = request.params as { guildId: string };
    const body = parseBody(seekRelativeSchema, request.body);
    await getPlayer(guildId).seekRelative(body.delta);
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/volume', async (request) => {
    const { guildId } = request.params as { guildId: string };
    const body = parseBody(volumeSchema, request.body);
    getPlayer(guildId).setVolume(body.volume);
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/loop', async (request) => {
    const { guildId } = request.params as { guildId: string };
    const body = parseBody(loopSchema, request.body);
    getPlayer(guildId).setLoop(body.mode);
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/shuffle', async (request) => {
    const { guildId } = request.params as { guildId: string };
    const body = parseBody(toggleSchema, request.body);
    getPlayer(guildId).setShuffle(body.enabled);
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/shuffle-queue', async (request) => {
    const { guildId } = request.params as { guildId: string };
    getPlayer(guildId).shuffleQueue();
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/autoplay', async (request) => {
    const { guildId } = request.params as { guildId: string };
    const body = parseBody(toggleSchema, request.body);
    getPlayer(guildId).setAutoplay(body.enabled);
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/jump', async (request) => {
    const { guildId } = request.params as { guildId: string };
    const body = parseBody(jumpSchema, request.body);
    const track = await getPlayer(guildId).jumpTo(body.index);
    if (!track) throw new NotFoundError('There is no track at that position');
    return snapshot(guildId);
  });

  app.post('/guilds/:guildId/player/move', async (request) => {
    const { guildId } = request.params as { guildId: string };
    const body = parseBody(queueMoveSchema, request.body);
    if (!getPlayer(guildId).moveTrack(body.from, body.to)) {
      throw new NotFoundError('There is no track at that position');
    }
    return snapshot(guildId);
  });

  app.delete('/guilds/:guildId/player/queue/:trackId', async (request) => {
    const { guildId, trackId } = request.params as { guildId: string; trackId: string };
    const player = getPlayer(guildId);
    if (!player.removeTrack(trackId)) throw new NotFoundError('That track is not in the queue');
    return snapshot(guildId);
  });

  app.delete('/guilds/:guildId/player/queue', async (request) => {
    const { guildId } = request.params as { guildId: string };
    getPlayer(guildId).clearQueue();
    return snapshot(guildId);
  });

  app.get('/guilds/:guildId/history', async (request) => {
    const { guildId } = request.params as { guildId: string };
    const { limit } = request.query as { limit?: string };
    return historyRepository.recent(guildId, Number(limit ?? 50) || 50);
  });

  app.get('/guilds/:guildId/top-tracks', async (request) => {
    const { guildId } = request.params as { guildId: string };
    const { limit } = request.query as { limit?: string };
    return historyRepository.topTracks(guildId, Number(limit ?? 10) || 10);
  });
}

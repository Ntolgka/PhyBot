import type { FastifyInstance } from 'fastify';
import { soundInputSchema, soundPlaySchema, soundUpdateSchema } from '@phybot/shared';
import {
  createSound,
  deleteSound,
  listSounds,
  playSound,
  updateSound,
} from '../../soundboard/index.js';
import { parseBody } from '../validation.js';

export async function soundboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sounds', async (request) => {
    const { guildId } = request.query as { guildId?: string };
    if (!guildId) return [];
    return listSounds(guildId);
  });

  app.post('/sounds', async (request) => {
    const body = parseBody(soundInputSchema, request.body);
    return createSound(body);
  });

  app.patch('/sounds/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(soundUpdateSchema, request.body);
    return updateSound(Number(id), body);
  });

  app.delete('/sounds/:id', async (request) => {
    const { id } = request.params as { id: string };
    await deleteSound(Number(id));
    return { ok: true };
  });

  app.post('/sounds/:id/play', async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(soundPlaySchema, request.body);
    await playSound({
      guildId: body.guildId,
      soundId: Number(id),
      voiceChannelId: body.voiceChannelId,
    });
    return { ok: true };
  });
}

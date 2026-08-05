import type { FastifyInstance } from 'fastify';
import { ttsSpeakSchema, ttsVoiceInputSchema, ttsVoiceUpdateSchema } from '@phybot/shared';
import { speakInVoice } from '../../ai/index.js';
import { listCatalog, voiceRegistry } from '../../ai/tts/index.js';
import { parseBody } from '../validation.js';

/**
 * The voice list is data, not code: voices can be added from the provider
 * catalogues or pointed at an external program, and every one of them becomes
 * selectable when the bot speaks.
 */
export async function ttsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tts/voices', async () => voiceRegistry.list());

  app.get('/tts/catalog', async () => listCatalog());

  app.post('/tts/voices', async (request) => {
    const body = parseBody(ttsVoiceInputSchema, request.body);
    return voiceRegistry.create(body);
  });

  app.patch('/tts/voices/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(ttsVoiceUpdateSchema, request.body);
    return voiceRegistry.update(Number(id), body);
  });

  app.post('/tts/voices/:id/default', async (request) => {
    const { id } = request.params as { id: string };
    voiceRegistry.setDefault(Number(id));
    return voiceRegistry.require(Number(id));
  });

  app.delete('/tts/voices/:id', async (request) => {
    const { id } = request.params as { id: string };
    voiceRegistry.delete(Number(id));
    return { ok: true };
  });

  app.post('/tts/speak', async (request) => {
    const body = parseBody(ttsSpeakSchema, request.body);
    await speakInVoice({
      guildId: body.guildId,
      text: body.text,
      ...(body.voiceChannelId ? { voiceChannelId: body.voiceChannelId } : {}),
      ...(body.voiceId !== undefined ? { voiceId: body.voiceId } : {}),
    });
    return { ok: true };
  });
}

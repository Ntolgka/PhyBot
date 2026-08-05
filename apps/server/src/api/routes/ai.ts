import type { FastifyInstance } from 'fastify';
import { aiChatSchema, aiSettingsSchema, ttsSpeakSchema, voiceListenSchema } from '@phybot/shared';
import {
  chat,
  getAiSettings,
  getAiStatus,
  listVoices,
  setListening,
  speakInVoice,
  updateAiSettings,
} from '../../ai/index.js';
import { listImages } from '../../flux/index.js';
import { parseBody } from '../validation.js';

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ai/settings', async () => getAiSettings());

  app.patch('/ai/settings', async (request) => {
    const body = parseBody(aiSettingsSchema, request.body);
    return updateAiSettings(body);
  });

  app.get('/ai/status', async () => getAiStatus());

  app.get('/ai/voices', async () => listVoices());

  app.post('/ai/chat', async (request) => {
    const body = parseBody(aiChatSchema, request.body);

    // The assistant can draw; the ids let the dashboard show what it made.
    const generated: string[] = [];
    const reply = await chat({
      message: body.message,
      userId: 'dashboard',
      userName: 'Dashboard',
      ...(body.guildId ? { guildId: body.guildId } : {}),
      onGeneratedImages: (files) => generated.push(...files),
    });

    const images = generated.length > 0 ? listImages({ limit: generated.length }) : [];
    return { reply, images };
  });

  app.post('/ai/listen', async (request) => {
    const body = parseBody(voiceListenSchema, request.body);
    return setListening({
      guildId: body.guildId,
      enabled: body.enabled,
      ...(body.voiceChannelId ? { voiceChannelId: body.voiceChannelId } : {}),
    });
  });

  app.post('/ai/speak', async (request) => {
    const body = parseBody(ttsSpeakSchema, request.body);
    await speakInVoice({
      guildId: body.guildId,
      text: body.text,
      ...(body.voiceChannelId ? { voiceChannelId: body.voiceChannelId } : {}),
    });
    return { ok: true };
  });
}

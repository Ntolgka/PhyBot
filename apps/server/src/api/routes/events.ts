import type { FastifyInstance } from 'fastify';
import { eventInputSchema, eventUpdateSchema } from '@phybot/shared';
import {
  cancelEvent,
  createEvent,
  deleteEvent,
  getEvent,
  listEvents,
  publishEvent,
  updateEvent,
} from '../../features/index.js';
import { parseBody } from '../validation.js';

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.get('/events', async (request) => {
    const { guildId, includePast } = request.query as { guildId?: string; includePast?: string };
    return listEvents(guildId, includePast === 'true');
  });

  app.post('/events', async (request) => {
    const body = parseBody(eventInputSchema, request.body);
    return createEvent({ ...body, createdBy: 'dashboard', createdByName: 'Dashboard' });
  });

  app.patch('/events/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(eventUpdateSchema, request.body);
    return updateEvent(Number(id), body);
  });

  app.delete('/events/:id', async (request) => {
    const { id } = request.params as { id: string };
    await deleteEvent(Number(id));
    return { ok: true };
  });

  app.post('/events/:id/publish', async (request) => {
    const { id } = request.params as { id: string };
    return publishEvent(Number(id));
  });

  app.post('/events/:id/cancel', async (request) => {
    const { id } = request.params as { id: string };
    return cancelEvent(Number(id));
  });

  app.get('/events/:id', async (request) => {
    const { id } = request.params as { id: string };
    return getEvent(Number(id));
  });
}

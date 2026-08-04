import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rolePanelInputSchema, snowflake } from '@phybot/shared';
import {
  announceOffer,
  createPanel,
  deletePanel,
  getFreeGamesStatus,
  listPanels,
  publishPanel,
  refreshFreeGames,
  updatePanel,
} from '../../features/index.js';
import { parseBody } from '../validation.js';

export async function rolePanelRoutes(app: FastifyInstance): Promise<void> {
  app.get('/role-panels', async (request) => {
    const { guildId } = request.query as { guildId?: string };
    return listPanels(guildId);
  });

  app.post('/role-panels', async (request) => {
    const body = parseBody(rolePanelInputSchema, request.body);
    return createPanel(body);
  });

  app.patch('/role-panels/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = parseBody(rolePanelInputSchema.partial(), request.body);
    return updatePanel(Number(id), body);
  });

  app.delete('/role-panels/:id', async (request) => {
    const { id } = request.params as { id: string };
    await deletePanel(Number(id));
    return { ok: true };
  });

  app.post('/role-panels/:id/publish', async (request) => {
    const { id } = request.params as { id: string };
    return publishPanel(Number(id));
  });
}

const announceSchema = z.object({
  guildId: snowflake,
  offerId: z.string().min(1).max(200),
});

export async function freeGamesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/free-games', async () => getFreeGamesStatus());

  app.post('/free-games/refresh', async () => refreshFreeGames({ announce: true }));

  app.post('/free-games/announce', async (request) => {
    const body = parseBody(announceSchema, request.body);
    await announceOffer(body.guildId, body.offerId);
    return { ok: true };
  });
}

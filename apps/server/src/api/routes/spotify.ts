import type { FastifyInstance } from 'fastify';
import { createLogger } from '../../core/logger.js';
import { toErrorMessage } from '../../core/errors.js';
import {
  buildAuthorizeUrl,
  completeAuthorization,
  disconnectSpotify,
  getSpotifyConnection,
} from '../../music/spotifyAuth.js';

const log = createLogger('spotify:auth');

/** Sends the browser back to the dashboard with a short result marker. */
function backToDashboard(result: string): string {
  return `/?spotify=${encodeURIComponent(result)}`;
}

export async function spotifyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/spotify/status', async () => getSpotifyConnection());

  app.post('/spotify/connect', async () => ({ url: buildAuthorizeUrl() }));

  app.post('/spotify/disconnect', async () => disconnectSpotify());

  // Spotify redirects the owner's browser here after the consent screen.
  app.get('/spotify/callback', async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };

    if (query.error) {
      log.warn(`Spotify authorisation was declined: ${query.error}`);
      return reply.redirect(backToDashboard('denied'));
    }
    if (!query.code || !query.state) {
      return reply.redirect(backToDashboard('invalid'));
    }

    try {
      await completeAuthorization(query.code, query.state);
      return reply.redirect(backToDashboard('connected'));
    } catch (error) {
      log.warn(`Spotify authorisation failed: ${toErrorMessage(error)}`);
      return reply.redirect(backToDashboard('failed'));
    }
  });
}

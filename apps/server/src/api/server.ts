import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ApiErrorBody } from '@phybot/shared';
import { config, rootDir } from '../core/config.js';
import { AppError, toErrorMessage } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import { getStatus } from '../discord/client.js';
import { resolveSessionSecret, requireSession } from './auth.js';
import { aiRoutes } from './routes/ai.js';
import { authRoutes } from './routes/auth.js';
import { botRoutes } from './routes/bot.js';
import { commandRoutes } from './routes/commands.js';
import { eventRoutes } from './routes/events.js';
import { guildRoutes } from './routes/guilds.js';
import { freeGamesRoutes, rolePanelRoutes } from './routes/misc.js';
import { musicRoutes } from './routes/music.js';
import { fluxRoutes } from './routes/flux.js';
import { soundboardRoutes } from './routes/soundboard.js';
import { ttsRoutes } from './routes/tts.js';
import { spotifyRoutes } from './routes/spotify.js';
import { registerWebsocket } from './ws.js';

const log = createLogger('api');

/** Routes reachable without a session. */
const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/session',
  '/api/auth/logout',
  // Spotify redirects the browser here; the one-time state value guards it.
  '/api/spotify/callback',
]);

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    trustProxy: false,
    bodyLimit: 12 * 1024 * 1024,
  });

  await app.register(cookie, { secret: resolveSessionSecret() });
  await app.register(rateLimit, {
    global: false,
    max: 120,
    timeWindow: '1 minute',
  });
  await app.register(websocket, { options: { maxPayload: 1024 * 64 } });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      const body: ApiErrorBody = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
      void reply.status(error.status).send(body);
      return;
    }

    const statusCode = (error as { statusCode?: unknown }).statusCode;
    const status = typeof statusCode === 'number' ? statusCode : 500;
    if (status >= 500) {
      log.error({ err: error, url: request.url }, 'Request failed');
    }
    const body: ApiErrorBody = {
      error: {
        code: status === 429 ? 'rate_limited' : 'internal_error',
        message:
          status >= 500
            ? 'Something went wrong on the server. Check the logs for details.'
            : toErrorMessage(error),
      },
    };
    void reply.status(status).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      const body: ApiErrorBody = {
        error: { code: 'not_found', message: `No route for ${request.method} ${request.url}` },
      };
      void reply.status(404).send(body);
      return;
    }
    // Everything else falls through to the dashboard's client side router.
    void reply.sendFile('index.html');
  });

  await app.register(
    async (api) => {
      api.addHook('onRequest', async (request) => {
        if (PUBLIC_PATHS.has(request.url.split('?')[0] ?? '')) return;
        if (request.headers.upgrade?.toLowerCase() === 'websocket') return;
        requireSession(request);
      });

      api.get('/health', async () => ({ status: 'ok', bot: getStatus() }));

      await api.register(authRoutes);
      await api.register(botRoutes);
      await api.register(guildRoutes);
      await api.register(musicRoutes);
      await api.register(eventRoutes);
      await api.register(commandRoutes);
      await api.register(rolePanelRoutes);
      await api.register(freeGamesRoutes);
      await api.register(aiRoutes);
      await api.register(spotifyRoutes);
      await api.register(soundboardRoutes);
      await api.register(fluxRoutes);
      await api.register(ttsRoutes);
    },
    { prefix: '/api' },
  );

  registerWebsocket(app);

  const webRoot = resolve(rootDir, 'apps/web/dist');
  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot, index: ['index.html'] });
  } else {
    log.warn(
      'The dashboard has not been built yet. Run "npm run build" to serve it from this server, or use "npm run dev" during development.',
    );
    app.get('/', async (_request, reply) => {
      void reply
        .type('text/html')
        .send(
          '<!doctype html><meta charset="utf-8"><title>PhyBot</title><body style="font-family:system-ui;background:#0a0a0f;color:#e5e7eb;padding:48px"><h1>PhyBot is running</h1><p>The dashboard has not been built yet. Run <code>npm run build</code> and reload this page.</p></body>',
        );
    });
  }

  return app;
}

/** IPv4 addresses another machine on the network can actually reach. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry!.address);
}

export async function startApiServer(): Promise<FastifyInstance> {
  if (!config.web.password && !config.web.allowInsecure) {
    log.warn(
      'DASHBOARD_PASSWORD is not set in .env. The dashboard will refuse sign in attempts until you set one.',
    );
  }
  const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(config.web.host);
  if (!isLoopback && !config.web.password) {
    throw new AppError(
      'insecure_binding',
      `Refusing to listen on ${config.web.host} without DASHBOARD_PASSWORD. Set a password in .env first.`,
      500,
    );
  }

  const app = await buildServer();
  await app.listen({ host: config.web.host, port: config.web.port });

  // A wildcard bind is an instruction to the socket, not an address a browser
  // can open, so the reachable ones are named instead.
  const wildcard = ['0.0.0.0', '::', '[::]'].includes(config.web.host);
  const addresses = wildcard ? lanAddresses() : [config.web.host];
  const urls = addresses.map((address) => `http://${address}:${config.web.port}`);
  log.info(`Dashboard and API ready on ${urls.join(' , ') || `port ${config.web.port}`}`);
  return app;
}

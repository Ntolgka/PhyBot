import type { FastifyInstance } from 'fastify';
import { loginSchema, type SessionInfo } from '@phybot/shared';
import { AppError, UnauthorizedError } from '../../core/errors.js';
import { config } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import { clearSession, issueSession, readSession, verifyPassword } from '../auth.js';
import { parseBody } from '../validation.js';

const log = createLogger('auth');

function toSessionInfo(expiresAt: number | null): SessionInfo {
  return {
    authenticated: expiresAt !== null,
    expiresIn: expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 1000)) : 0,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const body = parseBody(loginSchema, request.body);
      if (!config.web.password) {
        throw new AppError(
          'password_not_set',
          'Set DASHBOARD_PASSWORD in .env and restart the bot before signing in.',
          503,
        );
      }
      if (!verifyPassword(body.password)) {
        log.warn({ ip: request.ip }, 'Rejected a dashboard sign in attempt');
        throw new UnauthorizedError('That password is not correct');
      }
      const expiresAt = issueSession(request, reply);
      return toSessionInfo(expiresAt);
    },
  });

  app.post('/auth/logout', async (request, reply) => {
    clearSession(request, reply);
    return { ok: true };
  });

  app.get('/auth/session', async (request) => {
    const session = readSession(request);
    return toSessionInfo(session?.expiresAt ?? null);
  });
}

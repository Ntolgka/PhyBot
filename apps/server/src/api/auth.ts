import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from '@phybot/shared';
import { config } from '../core/config.js';
import { UnauthorizedError } from '../core/errors.js';
import { sessionsRepository } from '../db/repositories/misc.js';

/**
 * The dashboard is a single user tool, so authentication is one password from
 * the environment plus an opaque session token stored hashed in the database.
 */
export function verifyPassword(candidate: string): boolean {
  const expected = config.web.password;
  if (!expected) return false;
  const salt = 'phybot-dashboard';
  const a = scryptSync(candidate, salt, 32);
  const b = scryptSync(expected, salt, 32);
  return timingSafeEqual(a, b);
}

/** Reads the cookie signing secret, generating and storing one on first run. */
export function resolveSessionSecret(): string {
  if (config.web.sessionSecret && config.web.sessionSecret.length >= 16) {
    return config.web.sessionSecret;
  }
  const file = resolve(config.dataDir, 'session-secret.key');
  if (existsSync(file)) {
    const stored = readFileSync(file, 'utf8').trim();
    if (stored.length >= 16) return stored;
  }
  const generated = randomBytes(32).toString('base64url');
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

export function issueSession(request: FastifyRequest, reply: FastifyReply): number {
  const { token, expiresAt } = sessionsRepository.create(request.headers['user-agent'] ?? '');
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    signed: true,
    secure: false,
    maxAge: SESSION_TTL_SECONDS,
  });
  return expiresAt;
}

export function readSession(request: FastifyRequest): { expiresAt: number } | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  return sessionsRepository.verify(unsigned.value);
}

export function clearSession(request: FastifyRequest, reply: FastifyReply): void {
  const raw = request.cookies[SESSION_COOKIE];
  if (raw) {
    const unsigned = request.unsignCookie(raw);
    if (unsigned.valid && unsigned.value) sessionsRepository.revoke(unsigned.value);
  }
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Fastify preHandler that protects every route except the public ones. */
export function requireSession(request: FastifyRequest): void {
  if (!readSession(request)) {
    throw new UnauthorizedError('Sign in to the dashboard to continue');
  }
}

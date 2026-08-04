import { randomBytes } from 'node:crypto';
import type { SpotifyConnection } from '@phybot/shared';
import { config } from '../core/config.js';
import { AppError, ExternalServiceError } from '../core/errors.js';
import { createLogger } from '../core/logger.js';
import { STATE_KEYS, stateRepository } from '../db/repositories/state.js';

const log = createLogger('spotify:auth');

/**
 * Optional link to the owner's own Spotify account.
 *
 * Application-only (client credentials) tokens are no longer allowed to read
 * playlist contents, and the public page shares at most 100 tracks. A normal
 * user authorisation, done once from the dashboard, restores the documented
 * API with full pagination and also covers the owner's private playlists.
 */
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SCOPES = ['playlist-read-private', 'playlist-read-collaborative'];
/** Pending authorisation attempts live only in memory and expire quickly. */
const STATE_TTL_MS = 10 * 60 * 1000;

interface StoredConnection {
  refreshToken: string;
  displayName: string | null;
  connectedAt: number;
}

interface CachedAccess {
  token: string;
  expiresAt: number;
}

const pendingStates = new Map<string, number>();
let accessCache: CachedAccess | null = null;
let lastError: string | null = null;

function readStored(): StoredConnection | null {
  return stateRepository.get<StoredConnection | null>(STATE_KEYS.spotifyAuth, null);
}

export function isSpotifyLinked(): boolean {
  return Boolean(readStored()?.refreshToken);
}

export function getSpotifyConnection(): SpotifyConnection {
  const stored = readStored();
  return {
    connected: Boolean(stored?.refreshToken),
    displayName: stored?.displayName ?? null,
    configured: Boolean(config.music.spotifyClientId && config.music.spotifyClientSecret),
    redirectUri: config.music.spotifyRedirectUri,
    connectedAt: stored?.connectedAt ?? null,
    lastError,
  };
}

function requireCredentials(): { id: string; secret: string } {
  const id = config.music.spotifyClientId;
  const secret = config.music.spotifyClientSecret;
  if (!id || !secret) {
    throw new AppError(
      'spotify_not_configured',
      'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env before linking a Spotify account.',
      400,
    );
  }
  return { id, secret };
}

function basicAuth(): string {
  const { id, secret } = requireCredentials();
  return Buffer.from(`${id}:${secret}`).toString('base64');
}

function prunePendingStates(): void {
  const now = Date.now();
  for (const [state, createdAt] of pendingStates) {
    if (now - createdAt > STATE_TTL_MS) pendingStates.delete(state);
  }
}

/** Builds the Spotify consent URL and remembers the one-time state value. */
export function buildAuthorizeUrl(): string {
  const { id } = requireCredentials();
  prunePendingStates();

  const state = randomBytes(16).toString('base64url');
  pendingStates.set(state, Date.now());

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', id);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', config.music.spotifyRedirectUri);
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('state', state);
  // Always ask, so linking a different account does not silently reuse the old one.
  url.searchParams.set('show_dialog', 'true');
  return url.toString();
}

async function postToken(body: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const description =
      typeof payload.error_description === 'string'
        ? payload.error_description
        : response.statusText;
    throw new ExternalServiceError('Spotify', `Authorisation failed: ${description}`);
  }
  return payload;
}

async function fetchDisplayName(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const profile = (await response.json()) as { display_name?: string; id?: string };
    return profile.display_name ?? profile.id ?? null;
  } catch {
    return null;
  }
}

/** Completes the consent flow and stores the refresh token. */
export async function completeAuthorization(
  code: string,
  state: string,
): Promise<SpotifyConnection> {
  prunePendingStates();
  if (!pendingStates.delete(state)) {
    throw new AppError('bad_state', 'That Spotify link expired. Start the connection again.', 400);
  }

  const payload = await postToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.music.spotifyRedirectUri,
    }),
  );

  const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token : null;
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : null;
  if (!refreshToken || !accessToken) {
    throw new ExternalServiceError('Spotify', 'Spotify did not return a usable token');
  }

  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
  accessCache = { token: accessToken, expiresAt: Date.now() + expiresIn * 1000 };

  const displayName = await fetchDisplayName(accessToken);
  stateRepository.set<StoredConnection>(STATE_KEYS.spotifyAuth, {
    refreshToken,
    displayName,
    connectedAt: Date.now(),
  });
  lastError = null;
  log.info(`Linked the Spotify account of ${displayName ?? 'the owner'}`);
  return getSpotifyConnection();
}

export function disconnectSpotify(): SpotifyConnection {
  stateRepository.delete(STATE_KEYS.spotifyAuth);
  accessCache = null;
  lastError = null;
  return getSpotifyConnection();
}

/**
 * Returns a user access token, refreshing it when needed. Null means no
 * account is linked, so callers fall back to the application token.
 */
export async function getUserAccessToken(): Promise<string | null> {
  const stored = readStored();
  if (!stored?.refreshToken) return null;
  if (accessCache && accessCache.expiresAt > Date.now() + 30_000) return accessCache.token;

  try {
    const payload = await postToken(
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: stored.refreshToken }),
    );
    const accessToken = typeof payload.access_token === 'string' ? payload.access_token : null;
    if (!accessToken) throw new ExternalServiceError('Spotify', 'No access token in the response');

    const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
    accessCache = { token: accessToken, expiresAt: Date.now() + expiresIn * 1000 };

    // Spotify may hand out a new refresh token; keep the newest one.
    if (
      typeof payload.refresh_token === 'string' &&
      payload.refresh_token !== stored.refreshToken
    ) {
      stateRepository.set<StoredConnection>(STATE_KEYS.spotifyAuth, {
        ...stored,
        refreshToken: payload.refresh_token,
      });
    }
    lastError = null;
    return accessToken;
  } catch (error) {
    lastError = (error as Error).message;
    log.warn(`Could not refresh the Spotify token: ${lastError}`);
    accessCache = null;
    return null;
  }
}

/** Called when Spotify rejects the stored authorisation so the UI can react. */
export function reportAuthorizationRejected(): void {
  lastError = 'Spotify rejected the linked account. Connect it again from the dashboard.';
  accessCache = null;
}

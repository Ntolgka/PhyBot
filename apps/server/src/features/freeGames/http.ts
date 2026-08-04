import { ExternalServiceError, toErrorMessage } from '../../core/errors.js';

const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = 'PhyBot-FreeGamesWatcher/1.0 (+https://discord.com)';

/**
 * Fetches and parses a JSON endpoint, converting network/HTTP/parse failures
 * into a single `ExternalServiceError` so callers only need one catch path.
 */
export async function fetchJson(url: string, serviceName: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ExternalServiceError(serviceName, toErrorMessage(error));
  }

  if (!response.ok) {
    throw new ExternalServiceError(serviceName, `Unexpected HTTP status ${response.status}`);
  }

  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new ExternalServiceError(serviceName, `Invalid JSON response: ${toErrorMessage(error)}`);
  }
}

import type { ApiErrorBody } from '@phybot/shared';

/** Typed error thrown by every failed request made through {@link api}. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string>;

  constructor(status: number, error: ApiErrorBody['error']) {
    super(error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Registered once at startup so the fetch layer can react to session expiry. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      signal: options.signal,
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, {
      code: 'network_error',
      message: 'Could not reach the server. Check your connection and try again.',
    });
  }

  const isAuthRoute = path.startsWith('/auth/');
  if (response.status === 401 && !isAuthRoute) {
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    let parsed: ApiErrorBody | null = null;
    try {
      parsed = (await response.json()) as ApiErrorBody;
    } catch {
      parsed = null;
    }
    if (parsed?.error) {
      throw new ApiError(response.status, parsed.error);
    }
    throw new ApiError(response.status, {
      code: 'unknown_error',
      message: response.statusText || 'Something went wrong. Please try again.',
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal): Promise<T> =>
    request<T>(path, { method: 'GET', signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> =>
    request<T>(path, { method: 'POST', body: body ?? {}, signal }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> =>
    request<T>(path, { method: 'PATCH', body: body ?? {}, signal }),
  delete: <T>(path: string, signal?: AbortSignal): Promise<T> =>
    request<T>(path, { method: 'DELETE', signal }),
};

/** Extracts a user-presentable message from any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

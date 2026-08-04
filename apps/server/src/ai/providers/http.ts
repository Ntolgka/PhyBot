import { ExternalServiceError, toErrorMessage } from '../../core/errors.js';

const DEFAULT_TIMEOUT_MS = 20_000;

interface BaseRequestOptions {
  url: string;
  service: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Overrides the generic message used when the provider replies with HTTP 429. */
  rateLimitMessage?: string;
}

interface JsonRequestOptions extends BaseRequestOptions {
  body: unknown;
}

interface FormRequestOptions extends BaseRequestOptions {
  form: FormData;
}

/** Posts a JSON body and parses a JSON response, translating failures into ExternalServiceError. */
export async function postJson<T>(options: JsonRequestOptions): Promise<T> {
  const res = await send(options.url, options.service, options.timeoutMs, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify(options.body),
  });
  return parseJsonResponse<T>(res, options.service, options.rateLimitMessage);
}

/** Posts a multipart form body (used for audio uploads) and parses a JSON response. */
export async function postForm<T>(options: FormRequestOptions): Promise<T> {
  const res = await send(options.url, options.service, options.timeoutMs, {
    method: 'POST',
    headers: options.headers,
    body: options.form,
  });
  return parseJsonResponse<T>(res, options.service, options.rateLimitMessage);
}

async function send(
  url: string,
  service: string,
  timeoutMs: number | undefined,
  init: { method: string; headers?: Record<string, string>; body: string | FormData },
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ExternalServiceError(service, describeNetworkError(error));
  }
}

async function parseJsonResponse<T>(
  res: Response,
  service: string,
  rateLimitMessage: string | undefined,
): Promise<T> {
  if (!res.ok) {
    if (res.status === 429) {
      throw new ExternalServiceError(
        service,
        rateLimitMessage ?? 'Kullanim sinirina ulasildi, birazdan tekrar deneyin',
      );
    }
    const detail = await safeErrorDetail(res);
    throw new ExternalServiceError(service, detail || `Istek basarisiz oldu (HTTP ${res.status})`);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ExternalServiceError(service, 'Sunucudan gecersiz yanit alindi');
  }
}

async function safeErrorDetail(res: Response): Promise<string> {
  try {
    const data = (await res.clone().json()) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof data.error === 'string') return data.error;
    return data.error?.message ?? data.message ?? '';
  } catch {
    return '';
  }
}

function describeNetworkError(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'Istek zaman asimina ugradi';
  return toErrorMessage(error);
}

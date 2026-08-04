/** Error carrying a stable code and HTTP status for the API layer. */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, string> | undefined;

  constructor(code: string, message: string, status = 400, details?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super('not_found', message, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('unauthorized', message, 401);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('conflict', message, 409);
  }
}

/** Raised when Discord, a music source or an AI provider fails. */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super('external_service', `${service}: ${message}`, 502);
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

import type { z } from 'zod';
import { AppError } from '../core/errors.js';

/** Validates a request payload and turns issues into a field keyed error. */
export function parseBody<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const details: Record<string, string> = {};
  for (const issue of result.error.issues) {
    details[issue.path.join('.') || 'body'] = issue.message;
  }
  throw new AppError('validation_failed', 'Some fields are invalid', 400, details);
}

import { z } from 'zod';

/** Converts a zod schema into a plain JSON schema object usable as tool parameters. */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/**
 * Gemini's function-declaration schema is an OpenAPI-flavoured subset that expects
 * upper-cased type names (STRING, OBJECT, ...) and rejects unknown keywords such as
 * "$schema" or "additionalProperties" that zod's JSON schema output includes.
 */
export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (node && typeof node === 'object') {
    const source = node as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (key === '$schema' || key === 'additionalProperties') continue;
      if (key === 'type' && typeof value === 'string') {
        result[key] = value.toUpperCase();
        continue;
      }
      result[key] = toGeminiSchema(value);
    }
    return result;
  }
  return node;
}

import type { AiSettings } from '@phybot/shared';
import { config } from '../../core/config.js';
import { ExternalServiceError, RateLimitError } from '../../core/errors.js';
import { createLogger } from '../../core/logger.js';
import { geminiChatProvider, transcribeWithGemini } from './gemini.js';
import { groqChatProvider, transcribeWithGroq } from './groq.js';
import { ollamaChatProvider } from './ollama.js';
import type { ChatProvider, SttProviderClient, SttRequest } from './types.js';

const log = createLogger('ai:providers');

export { synthesizeWithGemini } from './gemini.js';
export type { ChatCall, ChatProvider, ChatRequest, ChatTurn, ToolDefinition } from './types.js';

/** Picks the chat backend for the currently selected provider. */
export function createChatProvider(settings: AiSettings): ChatProvider {
  switch (settings.provider) {
    case 'gemini':
      return geminiChatProvider;
    case 'groq':
      return groqChatProvider;
    case 'ollama':
      return ollamaChatProvider;
    case 'none':
    default:
      throw new ExternalServiceError('ai', 'Bir yapay zeka saglayicisi secilmedi');
  }
}

type SttBackend = 'gemini' | 'groq';

/** Backend -> timestamp before which it is pointless to send another request. */
const sttCooldown = new Map<SttBackend, number>();

function sttBackendReady(backend: SttBackend): boolean {
  return backend === 'gemini' ? Boolean(config.ai.geminiApiKey) : Boolean(config.ai.groqApiKey);
}

/**
 * The selected backend first, then any other one that has credentials. Both
 * free tiers are small, so a quota that runs out on one should not take the
 * assistant offline while the other still works.
 */
function sttBackends(settings: AiSettings): SttBackend[] {
  const selected: SttBackend[] =
    settings.sttProvider === 'gemini' || settings.sttProvider === 'groq'
      ? [settings.sttProvider]
      : [];
  const alternatives = (['groq', 'gemini'] as SttBackend[]).filter(
    (backend) => !selected.includes(backend) && sttBackendReady(backend),
  );
  return [...selected, ...alternatives];
}

function transcribeWith(
  backend: SttBackend,
  settings: AiSettings,
  request: SttRequest,
): Promise<string> {
  return backend === 'gemini'
    ? transcribeWithGemini({ ...request, model: settings.model })
    : transcribeWithGroq({ ...request, model: config.ai.groqSttModel });
}

/** True when at least one speech-to-text backend is outside its cooldown. */
export function sttAvailable(settings: AiSettings): boolean {
  const now = Date.now();
  return sttBackends(settings).some((backend) => (sttCooldown.get(backend) ?? 0) <= now);
}

/**
 * Speech-to-text client that walks the backend list. A rate-limited backend is
 * parked for as long as the provider asked for, so the next utterance goes
 * straight to one that can still answer.
 */
export function createSttProvider(settings: AiSettings): SttProviderClient {
  const backends = sttBackends(settings);
  if (backends.length === 0) {
    throw new ExternalServiceError('ai', 'Konusma tanima saglayicisi secilmedi');
  }

  return {
    async transcribe(request) {
      const now = Date.now();
      const usable = backends.filter((backend) => (sttCooldown.get(backend) ?? 0) <= now);
      if (usable.length === 0) {
        const wait = Math.min(...backends.map((backend) => sttCooldown.get(backend) ?? 0)) - now;
        throw new RateLimitError(
          'stt',
          'Tum konusma tanima saglayicilari kullanim sinirinda',
          Math.max(wait, 0),
        );
      }

      let lastError: unknown;
      for (const backend of usable) {
        try {
          return await transcribeWith(backend, settings, request);
        } catch (error) {
          lastError = error;
          if (!(error instanceof RateLimitError)) throw error;
          sttCooldown.set(backend, Date.now() + error.retryAfterMs);
          log.warn(
            { backend, retryAfterMs: error.retryAfterMs },
            'Speech-to-text backend hit its rate limit, pausing it',
          );
        }
      }
      throw lastError;
    },
  };
}

/** Providers that currently have usable credentials, independent of what is selected. */
export function configuredProviders(): ('gemini' | 'groq' | 'ollama')[] {
  const providers: ('gemini' | 'groq' | 'ollama')[] = [];
  if (config.ai.geminiApiKey) providers.push('gemini');
  if (config.ai.groqApiKey) providers.push('groq');
  providers.push('ollama');
  return providers;
}

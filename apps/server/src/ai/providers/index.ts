import type { AiSettings } from '@phybot/shared';
import { config } from '../../core/config.js';
import { ExternalServiceError } from '../../core/errors.js';
import { geminiChatProvider, transcribeWithGemini } from './gemini.js';
import { groqChatProvider, transcribeWithGroq } from './groq.js';
import { ollamaChatProvider } from './ollama.js';
import type { ChatProvider, SttProviderClient } from './types.js';

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

/** Picks the speech-to-text backend for the currently selected provider. */
export function createSttProvider(settings: AiSettings): SttProviderClient {
  switch (settings.sttProvider) {
    case 'gemini':
      return {
        transcribe: (request) => transcribeWithGemini({ ...request, model: settings.model }),
      };
    case 'groq':
      return {
        transcribe: (request) => transcribeWithGroq({ ...request, model: config.ai.groqSttModel }),
      };
    case 'none':
    default:
      throw new ExternalServiceError('ai', 'Konusma tanima saglayicisi secilmedi');
  }
}

/** Providers that currently have usable credentials, independent of what is selected. */
export function configuredProviders(): ('gemini' | 'groq' | 'ollama')[] {
  const providers: ('gemini' | 'groq' | 'ollama')[] = [];
  if (config.ai.geminiApiKey) providers.push('gemini');
  if (config.ai.groqApiKey) providers.push('groq');
  providers.push('ollama');
  return providers;
}

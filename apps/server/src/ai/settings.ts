import { z } from 'zod';
import { AI_PROVIDERS, STT_PROVIDERS, type AiProvider, type AiSettings } from '@phybot/shared';
import { config } from '../core/config.js';
import { AppError } from '../core/errors.js';
import { stateRepository, STATE_KEYS } from '../db/repositories/state.js';

const MIN_MEMORY_TURNS = 0;
const MAX_MEMORY_TURNS = 20;
const MAX_PERSONA_LENGTH = 500;

/** Default chat model for a provider, taken from the environment configuration. */
function defaultModelFor(provider: AiProvider): string {
  switch (provider) {
    case 'gemini':
      return config.ai.geminiModel;
    case 'groq':
      return config.ai.groqModel;
    case 'ollama':
      return config.ai.ollamaModel;
    case 'none':
    default:
      return '';
  }
}

function defaultSettings(): AiSettings {
  return {
    provider: config.ai.provider,
    sttProvider: config.ai.sttProvider,
    model: defaultModelFor(config.ai.provider),
    language: config.ai.language,
    ttsVoice: config.ai.ttsVoice,
    wakeWord: config.ai.wakeWord,
    persona: '',
    speakReplies: true,
    memoryTurns: 6,
  };
}

const settingsPatchSchema = z
  .object({
    provider: z.enum(AI_PROVIDERS),
    sttProvider: z.enum(STT_PROVIDERS),
    model: z.string().trim().min(1).max(200),
    language: z.enum(['tr', 'en']),
    ttsVoice: z.string().trim().min(1).max(100),
    wakeWord: z.string().trim().min(1).max(50),
    persona: z.string().trim().max(MAX_PERSONA_LENGTH),
    speakReplies: z.boolean(),
    memoryTurns: z.number().int().min(MIN_MEMORY_TURNS).max(MAX_MEMORY_TURNS),
  })
  .partial();

/** Returns the persisted assistant settings, seeded from `.env` on first use. */
export function getAiSettings(): AiSettings {
  return stateRepository.get(STATE_KEYS.aiSettings, defaultSettings());
}

/** Applies a validated patch, persists it and returns the resulting settings. */
export function updateAiSettings(patch: Partial<AiSettings>): AiSettings {
  const parsed = settingsPatchSchema.safeParse(patch);
  if (!parsed.success) {
    throw new AppError(
      'invalid_ai_settings',
      parsed.error.issues[0]?.message ?? 'Gecersiz ayar degeri',
      400,
    );
  }

  const current = getAiSettings();
  const next: AiSettings = { ...current, ...parsed.data };
  // Switching provider without an explicit model pick would otherwise keep a
  // model name that belongs to the previous provider.
  if (parsed.data.provider && parsed.data.model === undefined) {
    next.model = defaultModelFor(parsed.data.provider);
  }

  return stateRepository.set(STATE_KEYS.aiSettings, next);
}

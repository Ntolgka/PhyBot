import type { AiRuntimeStatus } from '@phybot/shared';
import { configuredProviders } from './providers/index.js';
import { getAiSettings } from './settings.js';

const listeningGuilds = new Set<string>();
let lastError: string | null = null;

export function setLastError(message: string | null): void {
  lastError = message;
}

export function addListeningGuild(guildId: string): void {
  listeningGuilds.add(guildId);
}

export function removeListeningGuild(guildId: string): void {
  listeningGuilds.delete(guildId);
}

/** Computes the assistant's current readiness from settings and available credentials. */
export function getAiStatus(): AiRuntimeStatus {
  const settings = getAiSettings();
  const configured = configuredProviders();

  const textReady = settings.provider !== 'none' && configured.includes(settings.provider);
  const sttReady = settings.sttProvider !== 'none' && configured.includes(settings.sttProvider);

  return {
    textReady,
    sttReady,
    // Edge TTS needs no credentials; the Gemini fallback is only used opportunistically.
    ttsReady: true,
    configuredProviders: configured,
    lastError,
    listeningGuilds: [...listeningGuilds],
  };
}

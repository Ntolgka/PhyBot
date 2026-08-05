import type { TtsCatalogVoice } from '@phybot/shared';
import { createLogger } from '../../core/logger.js';
import { voiceRegistry } from './registry.js';

const log = createLogger('ai:tts');

/**
 * Voices that can be added to the registry. Edge publishes its whole catalogue
 * (hundreds of voices in dozens of languages), so it is fetched and cached
 * rather than hard coded.
 */
const EDGE_VOICE_LIST =
  'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4';

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface EdgeVoice {
  ShortName?: string;
  FriendlyName?: string;
  Gender?: string;
  Locale?: string;
}

/** Gemini offers a fixed set of prebuilt voices. */
const GEMINI_VOICES: { voiceId: string; name: string }[] = [
  { voiceId: 'Kore', name: 'Kore (firm)' },
  { voiceId: 'Puck', name: 'Puck (upbeat)' },
  { voiceId: 'Charon', name: 'Charon (informative)' },
  { voiceId: 'Fenrir', name: 'Fenrir (excitable)' },
  { voiceId: 'Aoede', name: 'Aoede (breezy)' },
];

let cache: { at: number; voices: TtsCatalogVoice[] } | null = null;

function friendlyName(voice: EdgeVoice): string {
  // "Microsoft Emel Online (Natural) - Turkish (Turkey)" is too long for a picker.
  const match = /Microsoft\s+(\w+)/.exec(voice.FriendlyName ?? '');
  return match?.[1] ?? voice.ShortName ?? 'Voice';
}

async function fetchEdgeCatalog(): Promise<TtsCatalogVoice[]> {
  const response = await fetch(EDGE_VOICE_LIST, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0',
      Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`voice list returned ${response.status}`);

  const payload = (await response.json()) as EdgeVoice[];
  return payload
    .filter((voice): voice is EdgeVoice & { ShortName: string } => Boolean(voice.ShortName))
    .map((voice) => ({
      provider: 'edge' as const,
      voiceId: voice.ShortName,
      name: friendlyName(voice),
      language: voice.Locale ?? '',
      gender: voice.Gender ?? '',
      added: false,
    }));
}

/**
 * Every voice that can be installed, with the ones already in the registry
 * marked. Falls back to whatever is cached when the list cannot be reached.
 */
export async function listCatalog(): Promise<TtsCatalogVoice[]> {
  let edge: TtsCatalogVoice[] = cache?.voices.filter((voice) => voice.provider === 'edge') ?? [];

  if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
    try {
      edge = await fetchEdgeCatalog();
    } catch (error) {
      log.warn(`Could not read the Edge voice catalogue: ${(error as Error).message}`);
    }
  }

  const gemini: TtsCatalogVoice[] = GEMINI_VOICES.map((voice) => ({
    provider: 'gemini' as const,
    voiceId: voice.voiceId,
    name: voice.name,
    language: 'multi',
    gender: '',
    added: false,
  }));

  const all = [...edge, ...gemini];
  cache = { at: Date.now(), voices: all };

  const installed = new Set(
    voiceRegistry.list().map((voice) => `${voice.provider}:${voice.voiceId}`),
  );
  return all.map((voice) => ({
    ...voice,
    added: installed.has(`${voice.provider}:${voice.voiceId}`),
  }));
}

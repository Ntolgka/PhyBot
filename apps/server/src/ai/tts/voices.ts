export interface VoiceOption {
  id: string;
  label: string;
}

/**
 * Curated subset of Microsoft Edge's neural voices. The full catalogue has
 * hundreds of entries; this keeps the dashboard picker short and guarantees
 * every listed id actually exists.
 */
const CURATED_VOICES: VoiceOption[] = [
  { id: 'tr-TR-EmelNeural', label: 'Emel (Turkce, Kadin)' },
  { id: 'tr-TR-AhmetNeural', label: 'Ahmet (Turkce, Erkek)' },
  { id: 'en-US-AriaNeural', label: 'Aria (English, Female)' },
  { id: 'en-US-GuyNeural', label: 'Guy (English, Male)' },
  { id: 'en-US-JennyNeural', label: 'Jenny (English, Female)' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia (English UK, Female)' },
];

export function listVoices(): VoiceOption[] {
  return CURATED_VOICES;
}

export function isKnownVoice(id: string): boolean {
  return CURATED_VOICES.some((voice) => voice.id === id);
}

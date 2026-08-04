export const AI_PROVIDERS = ['none', 'gemini', 'groq', 'ollama'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const STT_PROVIDERS = ['none', 'gemini', 'groq'] as const;
export type SttProvider = (typeof STT_PROVIDERS)[number];

export interface AiSettings {
  provider: AiProvider;
  sttProvider: SttProvider;
  model: string;
  language: 'tr' | 'en';
  ttsVoice: string;
  wakeWord: string;
  /** Extra instructions appended to the assistant system prompt. */
  persona: string;
  /** Reply out loud in the voice channel after executing a voice command. */
  speakReplies: boolean;
  /** Number of previous turns kept per channel for context. */
  memoryTurns: number;
}

export interface AiRuntimeStatus {
  textReady: boolean;
  sttReady: boolean;
  ttsReady: boolean;
  /** Which providers have credentials configured. */
  configuredProviders: AiProvider[];
  lastError: string | null;
  /** Guild ids where the assistant is currently listening in voice. */
  listeningGuilds: string[];
}

export interface AiVoiceEvent {
  guildId: string;
  userId: string;
  userName: string;
  transcript: string;
  reply: string;
  action: string | null;
  at: number;
}

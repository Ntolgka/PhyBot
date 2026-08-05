/**
 * Voices the bot can speak with. The list lives in the database rather than in
 * code so new engines and new voices, including locally cloned ones, can be
 * added without changing the bot.
 */
export const TTS_PROVIDERS = ['edge', 'gemini', 'command'] as const;
export type TtsProvider = (typeof TTS_PROVIDERS)[number];

export interface TtsVoice {
  id: number;
  /** Shown in the pickers, for example "Emel" or "Narrator". */
  name: string;
  provider: TtsProvider;
  /**
   * Identifier the provider understands: an Edge short name such as
   * `tr-TR-EmelNeural`, a Gemini prebuilt voice, or a free label for a
   * command based engine.
   */
  voiceId: string;
  language: string;
  gender: string;
  description: string;
  /** Executable for the `command` provider. */
  command: string;
  /**
   * Arguments for the `command` provider, one per line. `{output}` is replaced
   * with the file the engine must write, `{text}` with the text to read; when
   * `{text}` is absent the text is written to standard input instead.
   */
  commandArgs: string;
  enabled: boolean;
  /** Used when a request does not name a voice. */
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TtsVoiceInput {
  name: string;
  provider: TtsProvider;
  voiceId: string;
  language?: string;
  gender?: string;
  description?: string;
  command?: string;
  commandArgs?: string;
  enabled?: boolean;
  isDefault?: boolean;
}

/** An installable voice offered by a provider's own catalogue. */
export interface TtsCatalogVoice {
  provider: TtsProvider;
  voiceId: string;
  name: string;
  language: string;
  gender: string;
  /** True when the registry already contains this voice. */
  added: boolean;
}

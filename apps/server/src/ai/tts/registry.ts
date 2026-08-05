import type { TtsVoice, TtsVoiceInput, TtsProvider } from '@phybot/shared';
import { config } from '../../core/config.js';
import { ConflictError, NotFoundError } from '../../core/errors.js';
import { execute, queryAll, queryOne } from '../../db/database.js';

interface VoiceRow {
  id: number;
  name: string;
  provider: string;
  voice_id: string;
  language: string;
  gender: string;
  description: string;
  command: string;
  command_args: string;
  enabled: number;
  is_default: number;
  created_at: number;
  updated_at: number;
}

function toVoice(row: VoiceRow): TtsVoice {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as TtsProvider,
    voiceId: row.voice_id,
    language: row.language,
    gender: row.gender,
    description: row.description,
    command: row.command,
    commandArgs: row.command_args,
    enabled: row.enabled === 1,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS: Record<string, string> = {
  name: 'name',
  provider: 'provider',
  voiceId: 'voice_id',
  language: 'language',
  gender: 'gender',
  description: 'description',
  command: 'command',
  commandArgs: 'command_args',
  enabled: 'enabled',
  isDefault: 'is_default',
};

/** Voices every installation starts with, so the picker is never empty. */
const SEED_VOICES: TtsVoiceInput[] = [
  {
    name: 'Emel',
    provider: 'edge',
    voiceId: 'tr-TR-EmelNeural',
    language: 'tr-TR',
    gender: 'Female',
    isDefault: true,
  },
  {
    name: 'Ahmet',
    provider: 'edge',
    voiceId: 'tr-TR-AhmetNeural',
    language: 'tr-TR',
    gender: 'Male',
  },
  {
    name: 'Aria',
    provider: 'edge',
    voiceId: 'en-US-AriaNeural',
    language: 'en-US',
    gender: 'Female',
  },
  { name: 'Guy', provider: 'edge', voiceId: 'en-US-GuyNeural', language: 'en-US', gender: 'Male' },
];

export const voiceRegistry = {
  list(options: { enabledOnly?: boolean } = {}): TtsVoice[] {
    const rows = options.enabledOnly
      ? queryAll<VoiceRow>(
          'SELECT * FROM tts_voices WHERE enabled = 1 ORDER BY is_default DESC, name',
        )
      : queryAll<VoiceRow>('SELECT * FROM tts_voices ORDER BY is_default DESC, name');
    return rows.map(toVoice);
  },

  getById(id: number): TtsVoice | null {
    const row = queryOne<VoiceRow>('SELECT * FROM tts_voices WHERE id = ?', id);
    return row ? toVoice(row) : null;
  },

  require(id: number): TtsVoice {
    const voice = this.getById(id);
    if (!voice) throw new NotFoundError('That voice does not exist');
    return voice;
  },

  /** The voice used when a request does not name one. */
  getDefault(): TtsVoice | null {
    const row =
      queryOne<VoiceRow>('SELECT * FROM tts_voices WHERE is_default = 1 AND enabled = 1') ??
      queryOne<VoiceRow>('SELECT * FROM tts_voices WHERE enabled = 1 ORDER BY id LIMIT 1');
    return row ? toVoice(row) : null;
  },

  create(input: TtsVoiceInput): TtsVoice {
    const existing = queryOne<VoiceRow>(
      'SELECT * FROM tts_voices WHERE provider = ? AND voice_id = ?',
      input.provider,
      input.voiceId,
    );
    if (existing) throw new ConflictError(`"${input.name}" is already in the voice list`);

    const now = Date.now();
    const { lastInsertRowid } = execute(
      `INSERT INTO tts_voices
         (name, provider, voice_id, language, gender, description, command, command_args,
          enabled, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.name,
      input.provider,
      input.voiceId,
      input.language ?? '',
      input.gender ?? '',
      input.description ?? '',
      input.command ?? '',
      input.commandArgs ?? '',
      input.enabled === false ? 0 : 1,
      input.isDefault ? 1 : 0,
      now,
      now,
    );
    if (input.isDefault) this.setDefault(lastInsertRowid);
    return this.require(lastInsertRowid);
  },

  update(id: number, patch: Partial<TtsVoiceInput>): TtsVoice {
    this.require(id);
    const entries = Object.entries(patch).filter(([key]) => key in COLUMNS);
    if (entries.length > 0) {
      const assignments = entries.map(([key]) => `${COLUMNS[key]} = ?`).join(', ');
      const values = entries.map(([, value]) => {
        if (typeof value === 'boolean') return value ? 1 : 0;
        return typeof value === 'string' ? value : String(value ?? '');
      });
      execute(
        `UPDATE tts_voices SET ${assignments}, updated_at = ? WHERE id = ?`,
        ...values,
        Date.now(),
        id,
      );
    }
    if (patch.isDefault) this.setDefault(id);
    return this.require(id);
  },

  setDefault(id: number): void {
    execute('UPDATE tts_voices SET is_default = 0 WHERE id != ?', id);
    execute('UPDATE tts_voices SET is_default = 1, enabled = 1 WHERE id = ?', id);
  },

  delete(id: number): void {
    const voice = this.require(id);
    execute('DELETE FROM tts_voices WHERE id = ?', id);
    // Something always has to be the default.
    if (voice.isDefault) {
      const next = queryOne<VoiceRow>(
        'SELECT * FROM tts_voices WHERE enabled = 1 ORDER BY id LIMIT 1',
      );
      if (next) this.setDefault(next.id);
    }
  },

  /** Inserts the starter voices the first time the table is used. */
  seed(): void {
    const row = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM tts_voices');
    if ((row?.count ?? 0) > 0) return;

    for (const voice of SEED_VOICES) {
      this.create({
        ...voice,
        // Honour the voice chosen in .env for the initial default.
        isDefault: voice.voiceId === config.ai.ttsVoice || Boolean(voice.isDefault),
      });
    }
    const configured = queryOne<VoiceRow>(
      'SELECT * FROM tts_voices WHERE voice_id = ?',
      config.ai.ttsVoice,
    );
    if (configured) this.setDefault(configured.id);
  },
};

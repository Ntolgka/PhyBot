import type { Sound } from '@phybot/shared';
import { ConflictError } from '../core/errors.js';
import { execute, queryAll, queryOne, type SqlParam } from '../db/database.js';

interface SoundRow {
  id: number;
  guild_id: string;
  name: string;
  description: string;
  file_name: string;
  original_name: string;
  duration_ms: number;
  size_bytes: number;
  emoji: string | null;
  slash: number;
  volume: number;
  uses: number;
  created_at: number;
  updated_at: number;
}

export interface CreateSoundRecord {
  guildId: string;
  name: string;
  description: string;
  fileName: string;
  originalName: string;
  durationMs: number;
  sizeBytes: number;
  emoji: string | null;
  slash: boolean;
  volume: number;
}

export interface UpdateSoundRecord {
  name?: string;
  description?: string;
  fileName?: string;
  originalName?: string;
  durationMs?: number;
  sizeBytes?: number;
  emoji?: string | null;
  slash?: boolean;
  volume?: number;
}

function toSound(row: SoundRow): Sound {
  return {
    id: row.id,
    guildId: row.guild_id,
    name: row.name,
    description: row.description,
    fileName: row.file_name,
    originalName: row.original_name,
    durationSeconds: row.duration_ms / 1000,
    sizeBytes: row.size_bytes,
    emoji: row.emoji,
    slash: row.slash === 1,
    volume: row.volume,
    uses: row.uses,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS: Record<string, string> = {
  name: 'name',
  description: 'description',
  fileName: 'file_name',
  originalName: 'original_name',
  durationMs: 'duration_ms',
  sizeBytes: 'size_bytes',
  emoji: 'emoji',
  slash: 'slash',
  volume: 'volume',
};

export const soundRepository = {
  create(input: CreateSoundRecord): Sound {
    const name = input.name.toLowerCase();
    if (this.getByName(input.guildId, name)) {
      throw new ConflictError(`A sound named "${name}" already exists`);
    }

    const now = Date.now();
    const { lastInsertRowid } = execute(
      `INSERT INTO sounds
         (guild_id, name, description, file_name, original_name, duration_ms, size_bytes,
          emoji, slash, volume, uses, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      input.guildId,
      name,
      input.description,
      input.fileName,
      input.originalName,
      input.durationMs,
      input.sizeBytes,
      input.emoji,
      input.slash ? 1 : 0,
      input.volume,
      now,
      now,
    );
    const created = this.getById(lastInsertRowid);
    if (!created) throw new Error('Sound was not stored');
    return created;
  },

  getById(id: number): Sound | null {
    const row = queryOne<SoundRow>('SELECT * FROM sounds WHERE id = ?', id);
    return row ? toSound(row) : null;
  },

  getByName(guildId: string, name: string): Sound | null {
    const row = queryOne<SoundRow>(
      'SELECT * FROM sounds WHERE guild_id = ? AND name = ?',
      guildId,
      name.toLowerCase(),
    );
    return row ? toSound(row) : null;
  },

  list(guildId: string): Sound[] {
    const rows = queryAll<SoundRow>(
      'SELECT * FROM sounds WHERE guild_id = ? ORDER BY name',
      guildId,
    );
    return rows.map(toSound);
  },

  update(id: number, patch: UpdateSoundRecord): Sound | null {
    const current = this.getById(id);
    if (!current) return null;

    if (patch.name && patch.name.toLowerCase() !== current.name) {
      const conflict = this.getByName(current.guildId, patch.name);
      if (conflict && conflict.id !== id) {
        throw new ConflictError(`A sound named "${patch.name}" already exists`);
      }
    }

    const normalized: UpdateSoundRecord = { ...patch };
    if (normalized.name) normalized.name = normalized.name.toLowerCase();

    const entries = Object.entries(normalized).filter(([key]) => key in COLUMNS);
    if (entries.length > 0) {
      const assignments = entries.map(([key]) => `${COLUMNS[key]} = ?`).join(', ');
      const values: SqlParam[] = entries.map(([, value]) => {
        if (typeof value === 'boolean') return value ? 1 : 0;
        if (typeof value === 'string' || typeof value === 'number') return value;
        return null;
      });
      execute(
        `UPDATE sounds SET ${assignments}, updated_at = ? WHERE id = ?`,
        ...values,
        Date.now(),
        id,
      );
    }
    return this.getById(id);
  },

  incrementUses(id: number): void {
    execute('UPDATE sounds SET uses = uses + 1 WHERE id = ?', id);
  },

  delete(id: number): void {
    execute('DELETE FROM sounds WHERE id = ?', id);
  },
};

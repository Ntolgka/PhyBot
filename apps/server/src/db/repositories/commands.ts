import type { CustomCommand, CustomCommandInput, CustomCommandType } from '@phybot/shared';
import { ConflictError } from '../../core/errors.js';
import { execute, queryAll, queryOne, type SqlParam } from '../database.js';

interface CommandRow {
  id: number;
  guild_id: string;
  name: string;
  description: string;
  type: string;
  content: string;
  embed_title: string | null;
  embed_color: string | null;
  embed_image_url: string | null;
  required_role_id: string | null;
  slash: number;
  enabled: number;
  uses: number;
  created_at: number;
  updated_at: number;
}

function toCommand(row: CommandRow): CustomCommand {
  return {
    id: row.id,
    guildId: row.guild_id,
    name: row.name,
    description: row.description,
    type: row.type as CustomCommandType,
    content: row.content,
    embedTitle: row.embed_title,
    embedColor: row.embed_color,
    embedImageUrl: row.embed_image_url,
    requiredRoleId: row.required_role_id,
    slash: row.slash === 1,
    enabled: row.enabled === 1,
    uses: row.uses,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS: Record<string, string> = {
  name: 'name',
  description: 'description',
  type: 'type',
  content: 'content',
  embedTitle: 'embed_title',
  embedColor: 'embed_color',
  embedImageUrl: 'embed_image_url',
  requiredRoleId: 'required_role_id',
  slash: 'slash',
  enabled: 'enabled',
};

export const commandsRepository = {
  create(input: CustomCommandInput): CustomCommand {
    if (this.getByName(input.guildId, input.name)) {
      throw new ConflictError(`A command named "${input.name}" already exists`);
    }

    const now = Date.now();
    const { lastInsertRowid } = execute(
      `INSERT INTO custom_commands
         (guild_id, name, description, type, content, embed_title, embed_color, embed_image_url,
          required_role_id, slash, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.guildId,
      input.name.toLowerCase(),
      input.description ?? '',
      input.type ?? 'text',
      input.content,
      input.embedTitle ?? null,
      input.embedColor ?? null,
      input.embedImageUrl ?? null,
      input.requiredRoleId ?? null,
      input.slash === false ? 0 : 1,
      input.enabled === false ? 0 : 1,
      now,
      now,
    );
    const created = this.getById(lastInsertRowid);
    if (!created) throw new Error('Command was not stored');
    return created;
  },

  getById(id: number): CustomCommand | null {
    const row = queryOne<CommandRow>('SELECT * FROM custom_commands WHERE id = ?', id);
    return row ? toCommand(row) : null;
  },

  getByName(guildId: string, name: string): CustomCommand | null {
    const row = queryOne<CommandRow>(
      'SELECT * FROM custom_commands WHERE guild_id = ? AND name = ?',
      guildId,
      name.toLowerCase(),
    );
    return row ? toCommand(row) : null;
  },

  list(guildId?: string): CustomCommand[] {
    const rows = guildId
      ? queryAll<CommandRow>(
          'SELECT * FROM custom_commands WHERE guild_id = ? ORDER BY name',
          guildId,
        )
      : queryAll<CommandRow>('SELECT * FROM custom_commands ORDER BY guild_id, name');
    return rows.map(toCommand);
  },

  update(id: number, patch: Partial<CustomCommandInput>): CustomCommand | null {
    const entries = Object.entries(patch).filter(([key]) => key in COLUMNS);
    if (entries.length > 0) {
      const assignments = entries.map(([key]) => `${COLUMNS[key]} = ?`).join(', ');
      const values: SqlParam[] = entries.map(([key, value]) => {
        if (typeof value === 'boolean') return value ? 1 : 0;
        if (key === 'name' && typeof value === 'string') return value.toLowerCase();
        if (typeof value === 'string' || typeof value === 'number') return value;
        return null;
      });
      execute(
        `UPDATE custom_commands SET ${assignments}, updated_at = ? WHERE id = ?`,
        ...values,
        Date.now(),
        id,
      );
    }
    return this.getById(id);
  },

  incrementUses(id: number): void {
    execute('UPDATE custom_commands SET uses = uses + 1 WHERE id = ?', id);
  },

  delete(id: number): void {
    execute('DELETE FROM custom_commands WHERE id = ?', id);
  },
};

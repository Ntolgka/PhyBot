import type { RolePanel, RolePanelInput, RolePanelOption } from '@phybot/shared';
import { execute, queryAll, queryOne, type SqlParam } from '../database.js';

interface PanelRow {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  title: string;
  description: string;
  exclusive: number;
  options: string;
  created_at: number;
  updated_at: number;
}

function parseOptions(raw: string): RolePanelOption[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RolePanelOption[]) : [];
  } catch {
    return [];
  }
}

function toPanel(row: PanelRow): RolePanel {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    title: row.title,
    description: row.description,
    exclusive: row.exclusive === 1,
    options: parseOptions(row.options),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const rolePanelsRepository = {
  create(input: RolePanelInput): RolePanel {
    const now = Date.now();
    const { lastInsertRowid } = execute(
      `INSERT INTO role_panels (guild_id, channel_id, title, description, exclusive, options, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.guildId,
      input.channelId,
      input.title,
      input.description ?? '',
      input.exclusive ? 1 : 0,
      JSON.stringify(input.options),
      now,
      now,
    );
    const created = this.getById(lastInsertRowid);
    if (!created) throw new Error('Role panel was not stored');
    return created;
  },

  getById(id: number): RolePanel | null {
    const row = queryOne<PanelRow>('SELECT * FROM role_panels WHERE id = ?', id);
    return row ? toPanel(row) : null;
  },

  getByMessageId(messageId: string): RolePanel | null {
    const row = queryOne<PanelRow>('SELECT * FROM role_panels WHERE message_id = ?', messageId);
    return row ? toPanel(row) : null;
  },

  list(guildId?: string): RolePanel[] {
    const rows = guildId
      ? queryAll<PanelRow>(
          'SELECT * FROM role_panels WHERE guild_id = ? ORDER BY created_at DESC',
          guildId,
        )
      : queryAll<PanelRow>('SELECT * FROM role_panels ORDER BY created_at DESC');
    return rows.map(toPanel);
  },

  update(id: number, patch: Partial<RolePanelInput>): RolePanel | null {
    const columns: Record<string, string> = {
      channelId: 'channel_id',
      title: 'title',
      description: 'description',
      exclusive: 'exclusive',
      options: 'options',
    };
    const entries = Object.entries(patch).filter(([key]) => key in columns);
    if (entries.length > 0) {
      const assignments = entries.map(([key]) => `${columns[key]} = ?`).join(', ');
      const values: SqlParam[] = entries.map(([key, value]) => {
        if (key === 'options') return JSON.stringify(value ?? []);
        if (typeof value === 'boolean') return value ? 1 : 0;
        if (typeof value === 'string' || typeof value === 'number') return value;
        return null;
      });
      execute(
        `UPDATE role_panels SET ${assignments}, updated_at = ? WHERE id = ?`,
        ...values,
        Date.now(),
        id,
      );
    }
    return this.getById(id);
  },

  setMessageId(id: number, messageId: string | null): void {
    execute('UPDATE role_panels SET message_id = ? WHERE id = ?', messageId, id);
  },

  delete(id: number): void {
    execute('DELETE FROM role_panels WHERE id = ?', id);
  },
};

import type { EventInput, EventRsvp, GuildEvent, RsvpStatus } from '@phybot/shared';
import { execute, queryAll, queryOne, type SqlParam } from '../database.js';

interface EventRow {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  title: string;
  description: string;
  location: string;
  starts_at: number;
  ends_at: number | null;
  capacity: number;
  created_by: string;
  created_by_name: string;
  reminder_minutes: number;
  reminder_sent_at: number | null;
  cancelled: number;
  created_at: number;
}

interface RsvpRow {
  event_id: number;
  user_id: string;
  display_name: string;
  status: string;
  responded_at: number;
}

function toRsvp(row: RsvpRow): EventRsvp {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    status: row.status as RsvpStatus,
    respondedAt: row.responded_at,
  };
}

function toEvent(row: EventRow, rsvps: EventRsvp[]): GuildEvent {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: row.capacity,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    reminderMinutes: row.reminder_minutes,
    reminderSentAt: row.reminder_sent_at,
    cancelled: row.cancelled === 1,
    createdAt: row.created_at,
    rsvps,
  };
}

function loadRsvps(eventIds: number[]): Map<number, EventRsvp[]> {
  const result = new Map<number, EventRsvp[]>();
  if (eventIds.length === 0) return result;
  const placeholders = eventIds.map(() => '?').join(',');
  const rows = queryAll<RsvpRow>(
    `SELECT * FROM event_rsvps WHERE event_id IN (${placeholders}) ORDER BY responded_at`,
    ...eventIds,
  );
  for (const row of rows) {
    const list = result.get(row.event_id) ?? [];
    list.push(toRsvp(row));
    result.set(row.event_id, list);
  }
  return result;
}

function withRsvps(rows: EventRow[]): GuildEvent[] {
  const rsvps = loadRsvps(rows.map((row) => row.id));
  return rows.map((row) => toEvent(row, rsvps.get(row.id) ?? []));
}

export const eventsRepository = {
  create(input: EventInput & { createdBy: string; createdByName: string }): GuildEvent {
    const { lastInsertRowid } = execute(
      `INSERT INTO guild_events
         (guild_id, channel_id, title, description, location, starts_at, ends_at, capacity,
          created_by, created_by_name, reminder_minutes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.guildId,
      input.channelId,
      input.title,
      input.description ?? '',
      input.location ?? '',
      input.startsAt,
      input.endsAt ?? null,
      input.capacity ?? 0,
      input.createdBy,
      input.createdByName,
      input.reminderMinutes ?? 30,
      Date.now(),
    );
    const created = this.getById(lastInsertRowid);
    if (!created) throw new Error('Event was not stored');
    return created;
  },

  getById(id: number): GuildEvent | null {
    const row = queryOne<EventRow>('SELECT * FROM guild_events WHERE id = ?', id);
    return row ? (withRsvps([row])[0] ?? null) : null;
  },

  getByMessageId(messageId: string): GuildEvent | null {
    const row = queryOne<EventRow>('SELECT * FROM guild_events WHERE message_id = ?', messageId);
    return row ? (withRsvps([row])[0] ?? null) : null;
  },

  list(guildId?: string, includePast = false): GuildEvent[] {
    const conditions: string[] = [];
    const params: SqlParam[] = [];
    if (guildId) {
      conditions.push('guild_id = ?');
      params.push(guildId);
    }
    if (!includePast) {
      // Keep events visible for a few hours after they start.
      conditions.push('((ends_at IS NULL AND starts_at > ?) OR ends_at > ?)');
      params.push(Date.now() - 6 * 60 * 60 * 1000, Date.now());
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return withRsvps(
      queryAll<EventRow>(`SELECT * FROM guild_events ${where} ORDER BY starts_at ASC`, ...params),
    );
  },

  /** Events whose reminder is due and has not been sent yet. */
  dueReminders(now = Date.now()): GuildEvent[] {
    return withRsvps(
      queryAll<EventRow>(
        `SELECT * FROM guild_events
         WHERE cancelled = 0 AND reminder_sent_at IS NULL AND reminder_minutes > 0
           AND starts_at > ? AND starts_at - (reminder_minutes * 60000) <= ?`,
        now,
        now,
      ),
    );
  },

  update(id: number, patch: Partial<EventInput> & { cancelled?: boolean }): GuildEvent | null {
    const columns: Record<string, string> = {
      channelId: 'channel_id',
      title: 'title',
      description: 'description',
      location: 'location',
      startsAt: 'starts_at',
      endsAt: 'ends_at',
      capacity: 'capacity',
      reminderMinutes: 'reminder_minutes',
      cancelled: 'cancelled',
    };
    const entries = Object.entries(patch).filter(([key]) => key in columns);
    if (entries.length > 0) {
      const assignments = entries.map(([key]) => `${columns[key]} = ?`).join(', ');
      const values: SqlParam[] = entries.map(([, value]) => {
        if (typeof value === 'boolean') return value ? 1 : 0;
        if (typeof value === 'number' || typeof value === 'string') return value;
        return null;
      });
      execute(`UPDATE guild_events SET ${assignments} WHERE id = ?`, ...values, id);
    }
    return this.getById(id);
  },

  setMessageId(id: number, messageId: string | null): void {
    execute('UPDATE guild_events SET message_id = ? WHERE id = ?', messageId, id);
  },

  markReminderSent(id: number, at = Date.now()): void {
    execute('UPDATE guild_events SET reminder_sent_at = ? WHERE id = ?', at, id);
  },

  delete(id: number): void {
    execute('DELETE FROM guild_events WHERE id = ?', id);
  },

  setRsvp(eventId: number, userId: string, displayName: string, status: RsvpStatus): void {
    execute(
      `INSERT INTO event_rsvps (event_id, user_id, display_name, status, responded_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (event_id, user_id)
       DO UPDATE SET status = excluded.status, display_name = excluded.display_name, responded_at = excluded.responded_at`,
      eventId,
      userId,
      displayName,
      status,
      Date.now(),
    );
  },

  removeRsvp(eventId: number, userId: string): void {
    execute('DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?', eventId, userId);
  },

  /** Number of attendees marked as going, used for capacity checks. */
  countGoing(eventId: number): number {
    const row = queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM event_rsvps WHERE event_id = ? AND status = 'going'",
      eventId,
    );
    return row?.count ?? 0;
  },
};

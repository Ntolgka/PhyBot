import { createHash, randomBytes } from 'node:crypto';
import type { Track } from '@phybot/shared';
import { SESSION_TTL_SECONDS } from '@phybot/shared';
import { execute, queryAll, queryOne } from '../database.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Dashboard sessions. Tokens are stored hashed so a database copy is useless. */
export const sessionsRepository = {
  create(userAgent: string): { token: string; expiresAt: number } {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
    execute(
      'INSERT INTO sessions (token, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?)',
      hashToken(token),
      Date.now(),
      expiresAt,
      userAgent.slice(0, 200),
    );
    return { token, expiresAt };
  },

  verify(token: string): { expiresAt: number } | null {
    if (!token) return null;
    const hashed = hashToken(token);
    const row = queryOne<{ token: string; expires_at: number }>(
      'SELECT token, expires_at FROM sessions WHERE token = ?',
      hashed,
    );
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      execute('DELETE FROM sessions WHERE token = ?', hashed);
      return null;
    }
    return { expiresAt: row.expires_at };
  },

  revoke(token: string): void {
    execute('DELETE FROM sessions WHERE token = ?', hashToken(token));
  },

  revokeAll(): void {
    execute('DELETE FROM sessions');
  },

  purgeExpired(): void {
    execute('DELETE FROM sessions WHERE expires_at < ?', Date.now());
  },
};

export interface FreeGamePostRecord {
  offerId: string;
  guildId: string;
  channelId: string;
  messageId: string;
  postedAt: number;
  /** Normalised title, so a changed offer id cannot cause a second post. */
  titleKey: string;
}

/**
 * Bookkeeping of what has already been announced. Rows are kept forever on
 * purpose: a giveaway that comes back months later is not news, and the table
 * grows by a handful of rows per month.
 */
export const freeGamePostsRepository = {
  wasPosted(offerId: string, guildId: string, titleKey = ''): boolean {
    const byId = queryOne<{ found: number }>(
      'SELECT 1 AS found FROM free_game_posts WHERE offer_id = ? AND guild_id = ?',
      offerId,
      guildId,
    );
    if (byId) return true;
    if (!titleKey) return false;

    return Boolean(
      queryOne<{ found: number }>(
        'SELECT 1 AS found FROM free_game_posts WHERE guild_id = ? AND title_key = ?',
        guildId,
        titleKey,
      ),
    );
  },

  record(post: FreeGamePostRecord): void {
    execute(
      `INSERT INTO free_game_posts (offer_id, guild_id, channel_id, message_id, posted_at, title_key)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (offer_id, guild_id)
       DO UPDATE SET message_id = excluded.message_id, posted_at = excluded.posted_at, title_key = excluded.title_key`,
      post.offerId,
      post.guildId,
      post.channelId,
      post.messageId,
      post.postedAt,
      post.titleKey,
    );
  },
};

export interface HistoryEntry {
  id: number;
  guildId: string;
  title: string;
  author: string;
  url: string;
  source: string;
  duration: number;
  requestedBy: string;
  playedAt: number;
  /** Cover art, or null for plays stored before it was kept. */
  thumbnail: string | null;
}

interface HistoryRow {
  id: number;
  guild_id: string;
  title: string;
  author: string;
  url: string;
  source: string;
  duration: number;
  requested_by: string;
  played_at: number;
  thumbnail: string;
}

function toHistoryEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    guildId: row.guild_id,
    title: row.title,
    author: row.author,
    url: row.url,
    source: row.source,
    duration: row.duration,
    requestedBy: row.requested_by,
    playedAt: row.played_at,
    thumbnail: row.thumbnail || null,
  };
}

export const historyRepository = {
  /** Returns the stored row id, which identifies this exact play. */
  add(guildId: string, track: Track): number {
    return execute(
      `INSERT INTO play_history (guild_id, title, author, url, source, duration, requested_by, played_at, thumbnail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      guildId,
      track.title,
      track.author,
      track.url,
      track.source,
      Math.round(track.duration),
      track.requestedByName,
      Date.now(),
      track.thumbnail ?? '',
    ).lastInsertRowid;
  },

  /** One stored play, used by the Play again button left on an older card. */
  byId(id: number): HistoryEntry | null {
    const row = queryOne<HistoryRow>('SELECT * FROM play_history WHERE id = ?', id);
    return row ? toHistoryEntry(row) : null;
  },

  recent(guildId: string, limit = 50): HistoryEntry[] {
    const rows = queryAll<HistoryRow>(
      'SELECT * FROM play_history WHERE guild_id = ? ORDER BY played_at DESC LIMIT ?',
      guildId,
      Math.min(Math.max(limit, 1), 200),
    );
    return rows.map(toHistoryEntry);
  },

  topTracks(
    guildId: string,
    limit = 10,
  ): { title: string; author: string; url: string; plays: number }[] {
    return queryAll<{ title: string; author: string; url: string; plays: number }>(
      `SELECT title, author, url, COUNT(*) AS plays
       FROM play_history WHERE guild_id = ?
       GROUP BY url ORDER BY plays DESC, title ASC LIMIT ?`,
      guildId,
      Math.min(Math.max(limit, 1), 50),
    );
  },
};

export interface PlayCollection {
  id: number;
  guildId: string;
  url: string;
  title: string;
  trackCount: number;
}

interface CollectionRow {
  id: number;
  guild_id: string;
  url: string;
  title: string;
  track_count: number;
}

/**
 * Playlists as they were imported, so the card left behind by a finished
 * playlist can queue the whole thing again rather than its last song. The
 * request is stored, not the tracks: replaying re-resolves the playlist, which
 * is also what makes a playlist that has since changed come back current.
 */
export const collectionsRepository = {
  add(guildId: string, url: string, title: string, trackCount: number): number {
    return execute(
      `INSERT INTO play_collections (guild_id, url, title, track_count, added_at)
       VALUES (?, ?, ?, ?, ?)`,
      guildId,
      url,
      title,
      trackCount,
      Date.now(),
    ).lastInsertRowid;
  },

  byId(id: number): PlayCollection | null {
    const row = queryOne<CollectionRow>('SELECT * FROM play_collections WHERE id = ?', id);
    return row
      ? {
          id: row.id,
          guildId: row.guild_id,
          url: row.url,
          title: row.title,
          trackCount: row.track_count,
        }
      : null;
  },
};

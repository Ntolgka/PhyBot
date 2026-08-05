import { execute, queryOne } from '../database.js';

/**
 * Small JSON key/value store for singleton settings (presence, AI options,
 * watcher bookkeeping) that do not deserve their own table.
 */
export const stateRepository = {
  get<T>(key: string, fallback: T): T {
    const row = queryOne<{ value: string }>('SELECT value FROM app_state WHERE key = ?', key);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  },

  set<T>(key: string, value: T): T {
    execute(
      'INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      key,
      JSON.stringify(value),
    );
    return value;
  },

  /** Shallow merges a patch into an existing object value. */
  merge<T extends object>(key: string, fallback: T, patch: Partial<T>): T {
    const next = { ...this.get<T>(key, fallback), ...patch };
    this.set(key, next);
    return next;
  },

  delete(key: string): void {
    execute('DELETE FROM app_state WHERE key = ?', key);
  },
};

export const STATE_KEYS = {
  presence: 'bot:presence',
  aiSettings: 'ai:settings',
  aiListening: 'ai:listening',
  freeGamesCache: 'freegames:cache',
  freeGamesMeta: 'freegames:meta',
  spotifyAuth: 'spotify:auth',
} as const;

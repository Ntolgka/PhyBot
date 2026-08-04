import type { GameStore, GuildSettings, GuildSettingsUpdate } from '@phybot/shared';
import { GAME_STORES } from '@phybot/shared';
import { config } from '../../core/config.js';
import { execute, queryAll, queryOne, type SqlParam } from '../database.js';

interface SettingsRow {
  guild_id: string;
  prefix: string;
  locale: string;
  dj_role_id: string | null;
  auto_role_id: string | null;
  auto_role_enabled: number;
  auto_role_bot_id: string | null;
  welcome_enabled: number;
  welcome_channel_id: string | null;
  welcome_message: string;
  goodbye_enabled: number;
  goodbye_channel_id: string | null;
  goodbye_message: string;
  music_text_channel_id: string | null;
  announce_now_playing: number;
  default_volume: number;
  idle_timeout_seconds: number;
  free_games_enabled: number;
  free_games_channel_id: string | null;
  free_games_role_id: string | null;
  free_games_stores: string;
  events_channel_id: string | null;
  event_reminder_minutes: number;
  ai_enabled: number;
  ai_voice_enabled: number;
  ai_text_channel_id: string | null;
  updated_at: number;
}

/** Maps a settings field to its column; also drives the update statement. */
const COLUMNS: Record<keyof GuildSettingsUpdate, keyof SettingsRow> = {
  prefix: 'prefix',
  locale: 'locale',
  djRoleId: 'dj_role_id',
  autoRoleId: 'auto_role_id',
  autoRoleEnabled: 'auto_role_enabled',
  autoRoleBotId: 'auto_role_bot_id',
  welcomeEnabled: 'welcome_enabled',
  welcomeChannelId: 'welcome_channel_id',
  welcomeMessage: 'welcome_message',
  goodbyeEnabled: 'goodbye_enabled',
  goodbyeChannelId: 'goodbye_channel_id',
  goodbyeMessage: 'goodbye_message',
  musicTextChannelId: 'music_text_channel_id',
  announceNowPlaying: 'announce_now_playing',
  defaultVolume: 'default_volume',
  idleTimeoutSeconds: 'idle_timeout_seconds',
  freeGamesEnabled: 'free_games_enabled',
  freeGamesChannelId: 'free_games_channel_id',
  freeGamesRoleId: 'free_games_role_id',
  freeGamesStores: 'free_games_stores',
  eventsChannelId: 'events_channel_id',
  eventReminderMinutes: 'event_reminder_minutes',
  aiEnabled: 'ai_enabled',
  aiVoiceEnabled: 'ai_voice_enabled',
  aiTextChannelId: 'ai_text_channel_id',
};

function parseStores(raw: string): GameStore[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return ['steam', 'epic'];
    return parsed.filter((item): item is GameStore => GAME_STORES.includes(item as GameStore));
  } catch {
    return ['steam', 'epic'];
  }
}

function toSettings(row: SettingsRow): GuildSettings {
  return {
    guildId: row.guild_id,
    prefix: row.prefix,
    locale: row.locale === 'en' ? 'en' : 'tr',
    djRoleId: row.dj_role_id,
    autoRoleId: row.auto_role_id,
    autoRoleEnabled: row.auto_role_enabled === 1,
    autoRoleBotId: row.auto_role_bot_id,
    welcomeEnabled: row.welcome_enabled === 1,
    welcomeChannelId: row.welcome_channel_id,
    welcomeMessage: row.welcome_message,
    goodbyeEnabled: row.goodbye_enabled === 1,
    goodbyeChannelId: row.goodbye_channel_id,
    goodbyeMessage: row.goodbye_message,
    musicTextChannelId: row.music_text_channel_id,
    announceNowPlaying: row.announce_now_playing === 1,
    defaultVolume: row.default_volume,
    idleTimeoutSeconds: row.idle_timeout_seconds,
    freeGamesEnabled: row.free_games_enabled === 1,
    freeGamesChannelId: row.free_games_channel_id,
    freeGamesRoleId: row.free_games_role_id,
    freeGamesStores: parseStores(row.free_games_stores),
    eventsChannelId: row.events_channel_id,
    eventReminderMinutes: row.event_reminder_minutes,
    aiEnabled: row.ai_enabled === 1,
    aiVoiceEnabled: row.ai_voice_enabled === 1,
    aiTextChannelId: row.ai_text_channel_id,
    updatedAt: row.updated_at,
  };
}

function toColumnValue(key: keyof GuildSettingsUpdate, value: unknown): string | number | null {
  if (key === 'freeGamesStores') return JSON.stringify(value ?? []);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return null;
  return String(value);
}

export const settingsRepository = {
  /** Returns stored settings, inserting defaults the first time a guild is seen. */
  get(guildId: string): GuildSettings {
    const row = queryOne<SettingsRow>('SELECT * FROM guild_settings WHERE guild_id = ?', guildId);
    if (row) return toSettings(row);

    execute(
      'INSERT INTO guild_settings (guild_id, default_volume, idle_timeout_seconds, updated_at) VALUES (?, ?, ?, ?)',
      guildId,
      config.music.defaultVolume,
      config.music.idleTimeoutSeconds,
      Date.now(),
    );
    const created = queryOne<SettingsRow>(
      'SELECT * FROM guild_settings WHERE guild_id = ?',
      guildId,
    );
    if (!created) throw new Error(`Failed to create settings for guild ${guildId}`);
    return toSettings(created);
  },

  all(): GuildSettings[] {
    return queryAll<SettingsRow>('SELECT * FROM guild_settings').map(toSettings);
  },

  update(guildId: string, patch: GuildSettingsUpdate): GuildSettings {
    this.get(guildId);
    const entries = Object.entries(patch).filter(([key]) => key in COLUMNS) as [
      keyof GuildSettingsUpdate,
      unknown,
    ][];
    if (entries.length === 0) return this.get(guildId);

    const assignments = entries.map(([key]) => `${COLUMNS[key]} = ?`).join(', ');
    const values: SqlParam[] = entries.map(([key, value]) => toColumnValue(key, value));
    execute(
      `UPDATE guild_settings SET ${assignments}, updated_at = ? WHERE guild_id = ?`,
      ...values,
      Date.now(),
      guildId,
    );
    return this.get(guildId);
  },

  delete(guildId: string): void {
    execute('DELETE FROM guild_settings WHERE guild_id = ?', guildId);
  },
};

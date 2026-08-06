export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Append-only list. Never edit an applied migration; add a new one instead so
 * existing installations keep their data.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id              TEXT PRIMARY KEY,
        prefix                TEXT    NOT NULL DEFAULT '!',
        locale                TEXT    NOT NULL DEFAULT 'tr',
        dj_role_id            TEXT,
        auto_role_id          TEXT,
        auto_role_enabled     INTEGER NOT NULL DEFAULT 0,
        auto_role_bot_id      TEXT,
        welcome_enabled       INTEGER NOT NULL DEFAULT 0,
        welcome_channel_id    TEXT,
        welcome_message       TEXT    NOT NULL DEFAULT 'Aramiza hos geldin {user}!',
        goodbye_enabled       INTEGER NOT NULL DEFAULT 0,
        goodbye_channel_id    TEXT,
        goodbye_message       TEXT    NOT NULL DEFAULT '{user} sunucudan ayrildi.',
        music_text_channel_id TEXT,
        announce_now_playing  INTEGER NOT NULL DEFAULT 1,
        default_volume        INTEGER NOT NULL DEFAULT 100,
        idle_timeout_seconds  INTEGER NOT NULL DEFAULT 300,
        free_games_enabled    INTEGER NOT NULL DEFAULT 0,
        free_games_channel_id TEXT,
        free_games_role_id    TEXT,
        free_games_stores     TEXT    NOT NULL DEFAULT '["steam","epic"]',
        events_channel_id     TEXT,
        event_reminder_minutes INTEGER NOT NULL DEFAULT 30,
        ai_enabled            INTEGER NOT NULL DEFAULT 0,
        ai_voice_enabled      INTEGER NOT NULL DEFAULT 0,
        ai_text_channel_id    TEXT,
        updated_at            INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS guild_events (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id         TEXT    NOT NULL,
        channel_id       TEXT    NOT NULL,
        message_id       TEXT,
        title            TEXT    NOT NULL,
        description      TEXT    NOT NULL DEFAULT '',
        location         TEXT    NOT NULL DEFAULT '',
        starts_at        INTEGER NOT NULL,
        ends_at          INTEGER,
        capacity         INTEGER NOT NULL DEFAULT 0,
        created_by       TEXT    NOT NULL,
        created_by_name  TEXT    NOT NULL DEFAULT '',
        reminder_minutes INTEGER NOT NULL DEFAULT 30,
        reminder_sent_at INTEGER,
        cancelled        INTEGER NOT NULL DEFAULT 0,
        created_at       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_guild_start ON guild_events (guild_id, starts_at);

      CREATE TABLE IF NOT EXISTS event_rsvps (
        event_id     INTEGER NOT NULL REFERENCES guild_events (id) ON DELETE CASCADE,
        user_id      TEXT    NOT NULL,
        display_name TEXT    NOT NULL DEFAULT '',
        status       TEXT    NOT NULL,
        responded_at INTEGER NOT NULL,
        PRIMARY KEY (event_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS custom_commands (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id         TEXT    NOT NULL,
        name             TEXT    NOT NULL,
        description      TEXT    NOT NULL DEFAULT '',
        type             TEXT    NOT NULL DEFAULT 'text',
        content          TEXT    NOT NULL,
        embed_title      TEXT,
        embed_color      TEXT,
        embed_image_url  TEXT,
        required_role_id TEXT,
        slash            INTEGER NOT NULL DEFAULT 1,
        enabled          INTEGER NOT NULL DEFAULT 1,
        uses             INTEGER NOT NULL DEFAULT 0,
        created_at       INTEGER NOT NULL,
        updated_at       INTEGER NOT NULL,
        UNIQUE (guild_id, name)
      );

      CREATE TABLE IF NOT EXISTS role_panels (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id    TEXT    NOT NULL,
        channel_id  TEXT    NOT NULL,
        message_id  TEXT,
        title       TEXT    NOT NULL,
        description TEXT    NOT NULL DEFAULT '',
        exclusive   INTEGER NOT NULL DEFAULT 0,
        options     TEXT    NOT NULL DEFAULT '[]',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS free_game_posts (
        offer_id   TEXT    NOT NULL,
        guild_id   TEXT    NOT NULL,
        channel_id TEXT    NOT NULL,
        message_id TEXT    NOT NULL DEFAULT '',
        posted_at  INTEGER NOT NULL,
        PRIMARY KEY (offer_id, guild_id)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        user_agent TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS app_state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS play_history (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id     TEXT    NOT NULL,
        title        TEXT    NOT NULL,
        author       TEXT    NOT NULL DEFAULT '',
        url          TEXT    NOT NULL,
        source       TEXT    NOT NULL,
        duration     INTEGER NOT NULL DEFAULT 0,
        requested_by TEXT    NOT NULL DEFAULT '',
        played_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_guild_time ON play_history (guild_id, played_at DESC);
    `,
  },
  {
    version: 2,
    name: 'soundboard clips',
    sql: `
      CREATE TABLE IF NOT EXISTS sounds (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id      TEXT    NOT NULL,
        name          TEXT    NOT NULL,
        description   TEXT    NOT NULL DEFAULT '',
        file_name     TEXT    NOT NULL,
        original_name TEXT    NOT NULL DEFAULT '',
        duration_ms   INTEGER NOT NULL DEFAULT 0,
        size_bytes    INTEGER NOT NULL DEFAULT 0,
        emoji         TEXT,
        slash         INTEGER NOT NULL DEFAULT 0,
        volume        INTEGER NOT NULL DEFAULT 100,
        uses          INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        UNIQUE (guild_id, name)
      );
    `,
  },
  {
    version: 3,
    name: 'remember announced free games permanently',
    sql: `
      -- Matching on the normalised title as well as the store id keeps a game
      -- from being announced twice when a store changes its offer identifier.
      ALTER TABLE free_game_posts ADD COLUMN title_key TEXT NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS idx_free_game_posts_title
        ON free_game_posts (guild_id, title_key);
    `,
  },
  {
    version: 4,
    name: 'generated images',
    sql: `
      CREATE TABLE IF NOT EXISTS flux_images (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id           TEXT    NOT NULL,
        index_in_batch     INTEGER NOT NULL DEFAULT 0,
        prompt             TEXT    NOT NULL,
        negative_prompt    TEXT    NOT NULL DEFAULT '',
        seed               INTEGER NOT NULL DEFAULT -1,
        width              INTEGER NOT NULL,
        height             INTEGER NOT NULL,
        steps              INTEGER NOT NULL,
        cfg_scale          REAL    NOT NULL,
        file_name          TEXT    NOT NULL,
        upscaled_file_name TEXT,
        saved              INTEGER NOT NULL DEFAULT 0,
        duration_ms        INTEGER NOT NULL DEFAULT 0,
        requested_by       TEXT    NOT NULL DEFAULT '',
        created_at         INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_flux_images_created ON flux_images (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_flux_images_batch ON flux_images (batch_id);
    `,
  },
  {
    version: 5,
    name: 'text to speech voices',
    sql: `
      CREATE TABLE IF NOT EXISTS tts_voices (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        name         TEXT    NOT NULL,
        provider     TEXT    NOT NULL DEFAULT 'edge',
        voice_id     TEXT    NOT NULL,
        language     TEXT    NOT NULL DEFAULT '',
        gender       TEXT    NOT NULL DEFAULT '',
        description  TEXT    NOT NULL DEFAULT '',
        command      TEXT    NOT NULL DEFAULT '',
        command_args TEXT    NOT NULL DEFAULT '',
        enabled      INTEGER NOT NULL DEFAULT 1,
        is_default   INTEGER NOT NULL DEFAULT 0,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        UNIQUE (provider, voice_id)
      );
    `,
  },
  {
    version: 6,
    name: 'record how an image was upscaled and where it came from',
    sql: `
      ALTER TABLE flux_images ADD COLUMN upscaled_model TEXT NOT NULL DEFAULT '';
      ALTER TABLE flux_images ADD COLUMN upscale_refined INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE flux_images ADD COLUMN source_image_id INTEGER;
    `,
  },
  {
    version: 7,
    name: 'spoken announcements when people come and go from voice',
    sql: `
      ALTER TABLE guild_settings ADD COLUMN voice_announce_enabled INTEGER NOT NULL DEFAULT 1;
    `,
  },
];

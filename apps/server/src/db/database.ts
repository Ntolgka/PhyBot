import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import { migrations } from './migrations.js';

const log = createLogger('database');

export type Database = DatabaseSync;

/** Opens (or creates) the database and brings the schema up to date. */
export function openDatabase(file?: string): Database {
  const target = file ?? resolve(config.dataDir, 'phybot.sqlite');
  if (target !== ':memory:') {
    mkdirSync(resolve(target, '..'), { recursive: true });
  }

  const db = new DatabaseSync(target);
  // WAL keeps dashboard reads responsive while the bot writes.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = NORMAL');

  runMigrations(db);
  return db;
}

function runMigrations(db: Database): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)',
  );
  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as {
    version: number;
  }[];
  const applied = new Set(appliedRows.map((row) => row.version));

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    log.info(`Applying migration ${migration.version}: ${migration.name}`);
    // node:sqlite has no nested transaction helper, so drive it explicitly and
    // roll back on failure to avoid a half-applied schema.
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        Date.now(),
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed: ${(error as Error).message}`,
      );
    }
  }
}

/** Values accepted as statement parameters by node:sqlite. */
export type SqlParam = string | number | bigint | null | Uint8Array;

/**
 * node:sqlite returns untyped records. These helpers keep the unavoidable cast
 * in one place instead of spreading it across every repository call.
 */
export function queryAll<T>(sql: string, ...params: SqlParam[]): T[] {
  return getDatabase()
    .prepare(sql)
    .all(...params) as unknown as T[];
}

export function queryOne<T>(sql: string, ...params: SqlParam[]): T | undefined {
  return getDatabase()
    .prepare(sql)
    .get(...params) as unknown as T | undefined;
}

export function execute(sql: string, ...params: SqlParam[]): { lastInsertRowid: number } {
  const result = getDatabase()
    .prepare(sql)
    .run(...params);
  return { lastInsertRowid: Number(result.lastInsertRowid) };
}

let instance: Database | null = null;

/** Shared connection used by the repositories. */
export function getDatabase(): Database {
  instance ??= openDatabase();
  return instance;
}

export function closeDatabase(): void {
  if (!instance) return;
  try {
    instance.close();
  } finally {
    instance = null;
  }
}

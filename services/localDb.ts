import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

/** Creates the small local settings and queued-work tables used from app launch. */
export async function initializeLocalDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY NOT NULL,
      entity TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS exchange_rate_cache (
      base_currency TEXT NOT NULL,
      quote_currency TEXT NOT NULL,
      rate REAL NOT NULL CHECK (rate > 0),
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (base_currency, quote_currency)
    );
  `);
}

/** Reads a count for the pressable connection status sheet. */
export async function getPendingSyncCount() {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const result = await db.getFirstAsync<{ count: number }>("SELECT count(*) as count FROM sync_queue WHERE status = 'pending'");
  return result?.count ?? 0;
}

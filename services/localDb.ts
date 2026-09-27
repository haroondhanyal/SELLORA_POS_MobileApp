import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { encryptLocalJson, isLocalJsonEncrypted } from '@/services/localEncryption';

/** Creates the small local settings and queued-work tables used from app launch. */
export async function initializeLocalDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA secure_delete = ON;
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
    CREATE TABLE IF NOT EXISTS cached_sellable_items (
      warehouse_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (warehouse_id, item_key)
    );
    CREATE TABLE IF NOT EXISTS cached_warehouses (
      branch_id TEXT NOT NULL,
      id TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (branch_id, id)
    );
    CREATE TABLE IF NOT EXISTS cached_customers (
      branch_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(branch_id,id)
    );
    CREATE TABLE IF NOT EXISTS cached_sales_agents (
      branch_id TEXT NOT NULL, id TEXT NOT NULL, full_name TEXT NOT NULL,
      PRIMARY KEY(branch_id,id)
    );
    CREATE TABLE IF NOT EXISTS offline_customers (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, branch_id TEXT NOT NULL, payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','syncing','synced','failed')),
      last_error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, synced_at TEXT
    );
    CREATE TABLE IF NOT EXISTS offline_sales (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','syncing','synced','failed','conflict')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      server_sale_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      synced_at TEXT
    );
  `);

  // Encrypt sensitive cached records left by earlier app versions on first launch.
  await encryptLegacyPayloads(db);
  // Truncate the WAL so legacy plaintext cache pages are not left in the journal.
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
}

/** Protects existing plaintext JSON rows while keeping their SQLite IDs unchanged. */
async function encryptLegacyPayloads(db: SQLiteDatabase) {
  const payloadTables = [
    { table: 'sync_queue', keys: ['id'] },
    { table: 'cached_sellable_items', keys: ['warehouse_id', 'item_key'] },
    { table: 'cached_warehouses', keys: ['branch_id', 'id'] },
    { table: 'cached_customers', keys: ['branch_id', 'id'] },
    { table: 'offline_customers', keys: ['id'] },
    { table: 'offline_sales', keys: ['id'] },
  ] as const;

  for (const { table, keys } of payloadTables) {
    const rows = await db.getAllAsync<Record<string, string>>(`SELECT ${keys.join(',')},payload FROM ${table}`);
    for (const row of rows) {
      if (isLocalJsonEncrypted(row.payload)) continue;
      const encrypted = await encryptLocalJson(JSON.parse(row.payload));
      const where = keys.map((key) => `${key}=?`).join(' AND ');
      await db.runAsync(`UPDATE ${table} SET payload=? WHERE ${where}`, encrypted, ...keys.map((key) => row[key]));
    }
  }

  // Sales-agent names are stored in their own column rather than a JSON payload.
  const agents = await db.getAllAsync<{ branch_id: string; id: string; full_name: string }>(
    'SELECT branch_id,id,full_name FROM cached_sales_agents',
  );
  for (const agent of agents) {
    if (isLocalJsonEncrypted(agent.full_name)) continue;
    const encryptedName = await encryptLocalJson(agent.full_name);
    await db.runAsync(
      'UPDATE cached_sales_agents SET full_name=? WHERE branch_id=? AND id=?',
      encryptedName,
      agent.branch_id,
      agent.id,
    );
  }
}

/** Reads a count for the pressable connection status sheet. */
export async function getPendingSyncCount() {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const result = await db.getFirstAsync<{ count: number }>("SELECT (SELECT count(*) FROM sync_queue WHERE status = 'pending') + (SELECT count(*) FROM offline_sales WHERE status IN ('pending','failed','syncing')) + (SELECT count(*) FROM offline_customers WHERE status IN ('pending','failed','syncing')) as count");
  return result?.count ?? 0;
}

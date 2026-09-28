import * as SQLite from 'expo-sqlite';
import { apiRequest } from '@/services/api';
import { decryptLocalJson, encryptLocalJson } from '@/services/localEncryption';

export type AdminOverview = {
  generatedAt: string;
  team: Array<{ id: string; full_name: string; email: string; role: string; last_seen_at: string | null; online_devices: number; online: boolean }>;
  sales: Array<{ user_id: string; full_name: string; currency_code: string; sale_count: number; total: string }>;
};
const cacheKey = (userId: string) => `admin_overview:${userId}`;

async function readCached(userId: string) {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', cacheKey(userId));
  if (!row) return null;
  try { return await decryptLocalJson<AdminOverview>(row.value); } catch { return null; }
}

/** Returns fresh server activity, falling back to this admin device's encrypted snapshot. */
export async function loadAdminOverview(userId: string, allowNetwork = true): Promise<{ overview: AdminOverview; cached: boolean }> {
  if (!allowNetwork) {
    const cached = await readCached(userId);
    if (cached) return { overview: cached, cached: true };
    throw new Error('Team activity has not been synced on this device yet. Connect while online to load it.');
  }
  try {
    const overview = await apiRequest<AdminOverview>('/api/admin/overview');
    const db = await SQLite.openDatabaseAsync('sellora.db');
    await db.runAsync(
      'INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',
      cacheKey(userId), await encryptLocalJson(overview),
    );
    return { overview, cached: false };
  } catch (error) {
    const cached = await readCached(userId);
    if (cached) return { overview: cached, cached: true };
    throw error;
  }
}

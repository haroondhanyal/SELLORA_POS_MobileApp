import { requireDatabase } from '@/services/database';
import * as SQLite from 'expo-sqlite';
import { getCurrentUser } from '@/services/auth';
import { decryptLocalJson, encryptLocalJson } from '@/services/localEncryption';
import { isOfflineWorkMode } from '@/services/connectivity';

export type Branch = { id: string; name: string; code: string; address: string | null; is_active: boolean };
export type Warehouse = { id: string; branch_id: string; name: string; address: string | null; manager_id: string | null; is_primary: boolean; is_active: boolean };

/** Loads branch choices for online administration without opening the native SQLite cache. */
export async function listBranchesForAdministration() {
  const { data, error } = await requireDatabase()
    .from('branches')
    .select('id, name, code, address, is_active')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as Branch[];
}

/** Lists branches visible to this account; database policies hide unassigned branches. */
export async function listBranches() {
  const user = await getCurrentUser();
  const key = user ? `branches:${user.id}` : '';
  const db = await SQLite.openDatabaseAsync('sellora.db');
  if (await isOfflineWorkMode()) {
    if (!key) throw new Error('Sign in while online before browsing cached branches.');
    const cached = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', key);
    if (cached) return decryptLocalJson<Branch[]>(cached.value);
    throw new Error('No branch list is saved on this device yet. Connect to Sellora once and retry.');
  }
  try {
    const { data, error } = await requireDatabase().from('branches').select('id, name, code, address, is_active').eq('is_active', true).order('name');
    if (error) throw error;
    const rows = (data ?? []) as Branch[];
    if (key) await db.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP', key, await encryptLocalJson(rows));
    return rows;
  } catch (error) {
    if (key) {
      const cached = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', key);
      if (cached) return decryptLocalJson<Branch[]>(cached.value);
    }
    throw error;
  }
}

/** Creates a branch; the database requires approved administrator access. */
export async function createBranch(input: { name: string; code: string; address: string }) {
  const { error } = await requireDatabase().from('branches').insert({ name: input.name.trim(), code: input.code.trim().toUpperCase(), address: input.address.trim() || null });
  if (error) throw error;
}

/** Lists active warehouses in branches assigned to the current user. */
export async function listWarehousesForBranch(branchId?: string) {
  const user = await getCurrentUser();
  const key = user && branchId ? `warehouses:${user.id}:${branchId}` : '';
  const db = await SQLite.openDatabaseAsync('sellora.db');
  async function readCached() {
    if (!key) return null;
    const cached = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', key);
    return cached ? decryptLocalJson<Warehouse[]>(cached.value) : null;
  }
  if (await isOfflineWorkMode()) {
    const cached = await readCached();
    if (cached) return cached;
    throw new Error('No warehouse list is saved for this branch. Connect to Sellora once and retry.');
  }
  try {
    let query = requireDatabase().from('warehouses').select('id, branch_id, name, address, manager_id, is_primary, is_active').eq('is_active', true);
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query.order('name');
    if (error) throw error;
    const rows = (data ?? []) as Warehouse[];
    if (key) await db.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP', key, await encryptLocalJson(rows));
    return rows;
  } catch (error) {
    const cached = await readCached();
    if (cached) return cached;
    throw error;
  }
}

/** Creates a warehouse; the database limits this to the branch administration permission. */
export async function createWarehouse(input: { branchId: string; name: string; address: string; managerId: string | null; isPrimary: boolean }) {
  const { data, error } = await requireDatabase().rpc('sellora_create_warehouse', {
    p_branch_id: input.branchId,
    p_name: input.name.trim(),
    p_address: input.address.trim(),
    p_manager_id: input.managerId,
    p_is_primary: input.isPrimary,
  });
  if (error) throw error;
  return data as string;
}

/** Assigns a primary and optional allowed branches atomically via the admin-only RPC. */
export async function assignUserBranches(userId: string, primaryBranchId: string | null, branchIds: string[]) {
  const { error } = await requireDatabase().rpc('sellora_assign_user_branches', {
    target_user: userId,
    target_primary: primaryBranchId,
    target_branches: branchIds,
  });
  if (error) throw error;
}

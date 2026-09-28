import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import type { UserProfile } from '@/types/auth';
import { decryptLocalJson, encryptLocalJson } from '@/services/localEncryption';

const activeUserKey = 'sellora_offline_account_id';
const accountSettingKey = (id: string) => `offline_account:${id}`;

export type OfflineAccount = {
  user: { id: string; email: string | null };
  profile: UserProfile;
  permissionCodes: string[];
};

/** Saves the last authenticated account and approved permissions for PIN-gated offline reopen. */
export async function saveOfflineAccount(account: OfflineAccount) {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const key = accountSettingKey(account.user.id);
  const value = await encryptLocalJson(account);
  await db.runAsync(
    'INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',
    key,
    value,
  );
  await SecureStore.setItemAsync(activeUserKey, account.user.id, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

/** Loads the encrypted local account snapshot associated with this device. */
export async function getOfflineAccount(userId?: string): Promise<OfflineAccount | null> {
  const id = userId ?? await SecureStore.getItemAsync(activeUserKey);
  if (!id) return null;
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key=?',
    accountSettingKey(id),
  );
  if (!row) return null;
  try {
    const account = await decryptLocalJson<OfflineAccount>(row.value);
    return account.user.id === id ? account : null;
  } catch {
    return null;
  }
}

/** Removes the offline sign-in pointer after the server confirms sign-out. */
export async function clearOfflineAccount() {
  await SecureStore.deleteItemAsync(activeUserKey);
}

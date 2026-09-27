import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

/** Returns a private, stable local identifier so receipts can be traced to a device. */
export async function getDeviceId() {
  const key = 'sellora_device_id';
  const saved = await SecureStore.getItemAsync(key);
  if (saved) return saved;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(key, created);
  return created;
}

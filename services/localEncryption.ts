import * as SecureStore from 'expo-secure-store';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';

const KEY_STORAGE_NAME = 'sellora_local_data_key_v1';
const ENCRYPTED_PREFIX = 'sellora:aes-gcm:v1:';

let cachedKey: Promise<AESEncryptionKey> | null = null;

/** Stores one random 256-bit local data key in the platform secure key store. */
async function getLocalEncryptionKey() {
  if (!cachedKey) {
    cachedKey = (async () => {
      let encodedKey = await SecureStore.getItemAsync(KEY_STORAGE_NAME);
      if (!encodedKey) {
        const key = await AESEncryptionKey.generate(256);
        encodedKey = await key.encoded('base64');
        await SecureStore.setItemAsync(KEY_STORAGE_NAME, encodedKey, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        });
        return key;
      }
      return AESEncryptionKey.import(encodedKey, 'base64');
    })().catch((error) => {
      cachedKey = null;
      throw error;
    });
  }
  return cachedKey;
}

/** Encrypts a JSON value before it is written to the local SQLite database. */
export async function encryptLocalJson(value: unknown) {
  const key = await getLocalEncryptionKey();
  const plainBytes = new TextEncoder().encode(JSON.stringify(value));
  const sealed = await aesEncryptAsync(plainBytes, key);
  return ENCRYPTED_PREFIX + await sealed.combined('base64');
}

/** Opens an encrypted local JSON value and keeps legacy JSON readable during migration. */
export async function decryptLocalJson<T>(value: string): Promise<T> {
  if (!value.startsWith(ENCRYPTED_PREFIX)) return JSON.parse(value) as T;
  const key = await getLocalEncryptionKey();
  const sealed = AESSealedData.fromCombined(value.slice(ENCRYPTED_PREFIX.length), {
    ivLength: 12,
    tagLength: 16,
  });
  const plainBytes = await aesDecryptAsync(sealed, key);
  return JSON.parse(new TextDecoder().decode(plainBytes)) as T;
}

/** Reports whether a saved SQLite payload has already been protected. */
export function isLocalJsonEncrypted(value: string) {
  return value.startsWith(ENCRYPTED_PREFIX);
}

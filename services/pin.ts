import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { getCurrentUser } from '@/services/auth';
import { getOfflineAccount } from '@/services/offlineIdentity';

function secureKey(prefix: string, id: string) { return `${prefix}_${id.replace(/[^A-Za-z0-9_]/g, '_')}`; }
function pinKey(userId: string) { return secureKey('sellora_device_pin', userId); }
function pendingPinKey(emailHash: string) { return secureKey('sellora_pending_pin', emailHash); }
function failedKey(userId: string) { return secureKey('sellora_pin_failed', userId); }
function lockedUntilKey(userId: string) { return secureKey('sellora_pin_lock_until', userId); }
function toHex(bytes: Uint8Array) { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''); }

async function createPinVerifier(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('Choose a PIN with 4 to 6 digits.');
  const salt = toHex(await Crypto.getRandomBytesAsync(16));
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
  return `${salt}:${hash}`;
}

/** Stores a salted PIN verifier in encrypted device storage; the PIN itself is never saved. */
export async function setDevicePin(pin: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sign in before setting a PIN.');
  await SecureStore.setItemAsync(pinKey(user.id), await createPinVerifier(pin));
}

/** Keeps only a salted verifier until email-confirmation signup gets a session. */
export async function rememberSignupPin(email: string, pin: string) {
  const emailHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    email.trim().toLowerCase(),
  );
  const verifier = await createPinVerifier(pin);
  await SecureStore.setItemAsync(pendingPinKey(emailHash), verifier);
}

/** Attaches a signup PIN to the authenticated account, then removes the temporary verifier. */
export async function activateSignupPin(email: string) {
  const user = await getCurrentUser();
  if (!user) return false;

  const emailHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    email.trim().toLowerCase(),
  );
  const key = pendingPinKey(emailHash);
  const verifier = await SecureStore.getItemAsync(key);
  if (!verifier) return false;

  await SecureStore.setItemAsync(pinKey(user.id), verifier);
  await SecureStore.deleteItemAsync(key);
  return true;
}

/** Verifies the entered PIN only when the same user's Sellora session exists on this device. */
export async function verifyDevicePin(pin: string, email: string) {
  const user = await getCurrentUser().catch(() => null)
    ?? (await getOfflineAccount())?.user
    ?? null;
  if (!user || user.email?.toLowerCase() !== email.trim().toLowerCase()) return false;
  const lockedUntil = Number(await SecureStore.getItemAsync(lockedUntilKey(user.id)) ?? '0');
  if (Date.now() < lockedUntil) return false;
  const saved = await SecureStore.getItemAsync(pinKey(user.id));
  if (!saved) return false;
  const [salt, expected] = saved.split(':');
  const actual = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
  if (actual === expected) {
    await SecureStore.deleteItemAsync(failedKey(user.id));
    await SecureStore.deleteItemAsync(lockedUntilKey(user.id));
    return true;
  }
  const failures = Number(await SecureStore.getItemAsync(failedKey(user.id)) ?? '0') + 1;
  await SecureStore.setItemAsync(failedKey(user.id), String(failures));
  if (failures >= 5) {
    await SecureStore.setItemAsync(lockedUntilKey(user.id), String(Date.now() + 30_000));
    await SecureStore.deleteItemAsync(failedKey(user.id));
  }
  return false;
}

/** Removes PIN unlock for this signed-in user. */
export async function clearDevicePin() {
  const user = await getCurrentUser();
  if (user) await SecureStore.deleteItemAsync(pinKey(user.id));
}

export async function hasDevicePin(userId: string) {
  return Boolean(await SecureStore.getItemAsync(pinKey(userId)));
}

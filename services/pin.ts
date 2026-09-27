import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { requireSupabase } from '@/services/supabase';

function pinKey(userId: string) { return `sellora_device_pin:${userId}`; }
function pendingPinKey(emailHash: string) { return `sellora_pending_pin:${emailHash}`; }
function failedKey(userId: string) { return `sellora_pin_failed:${userId}`; }
function lockedUntilKey(userId: string) { return `sellora_pin_lock_until:${userId}`; }
function toHex(bytes: Uint8Array) { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''); }

async function createPinVerifier(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('Choose a PIN with 4 to 6 digits.');
  const salt = toHex(await Crypto.getRandomBytesAsync(16));
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
  return `${salt}:${hash}`;
}

/** Stores a salted PIN verifier in encrypted device storage; the PIN itself is never saved. */
export async function setDevicePin(pin: string) {
  const client = requireSupabase();
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error('Sign in before setting a PIN.');
  await SecureStore.setItemAsync(pinKey(session.user.id), await createPinVerifier(pin));
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
  const client = requireSupabase();
  const { data: { session } } = await client.auth.getSession();
  if (!session) return false;

  const emailHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    email.trim().toLowerCase(),
  );
  const key = pendingPinKey(emailHash);
  const verifier = await SecureStore.getItemAsync(key);
  if (!verifier) return false;

  await SecureStore.setItemAsync(pinKey(session.user.id), verifier);
  await SecureStore.deleteItemAsync(key);
  return true;
}

/** Verifies the entered PIN only when the same user's Supabase session exists on this device. */
export async function verifyDevicePin(pin: string, email: string) {
  const client = requireSupabase();
  const { data: { session } } = await client.auth.getSession();
  if (!session || session.user.email?.toLowerCase() !== email.trim().toLowerCase()) return false;
  const lockedUntil = Number(await SecureStore.getItemAsync(lockedUntilKey(session.user.id)) ?? '0');
  if (Date.now() < lockedUntil) return false;
  const saved = await SecureStore.getItemAsync(pinKey(session.user.id));
  if (!saved) return false;
  const [salt, expected] = saved.split(':');
  const actual = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
  if (actual === expected) {
    await SecureStore.deleteItemAsync(failedKey(session.user.id));
    await SecureStore.deleteItemAsync(lockedUntilKey(session.user.id));
    return true;
  }
  const failures = Number(await SecureStore.getItemAsync(failedKey(session.user.id)) ?? '0') + 1;
  await SecureStore.setItemAsync(failedKey(session.user.id), String(failures));
  if (failures >= 5) {
    await SecureStore.setItemAsync(lockedUntilKey(session.user.id), String(Date.now() + 30_000));
    await SecureStore.deleteItemAsync(failedKey(session.user.id));
  }
  return false;
}

/** Removes PIN unlock for this signed-in user. */
export async function clearDevicePin() {
  const { data: { session } } = await requireSupabase().auth.getSession();
  if (session) await SecureStore.deleteItemAsync(pinKey(session.user.id));
}

export async function hasDevicePin(userId: string) {
  return Boolean(await SecureStore.getItemAsync(pinKey(userId)));
}

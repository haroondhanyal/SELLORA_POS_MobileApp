import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { getCurrentUser } from '@/services/auth';
import { requireDatabase } from '@/services/database';
import { getPrivateFileUrl, uploadPrivateFile } from '@/services/storage';

async function pendingAvatarKey(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const emailHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalizedEmail);
  return `sellora_pending_avatar_${emailHash}`;
}

/** Keeps a selected photo on-device until email confirmation and first sign-in. */
export async function rememberPendingAvatar(email: string, uri: string) {
  await SecureStore.setItemAsync(await pendingAvatarKey(email), uri);
}

/** Uploads a selected photo to the signed-in user's private avatar folder. */
export async function uploadProfileAvatar(uri: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sign in before uploading a profile photo.');
  const extension = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const contentType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  const path = `${user.id}/${Crypto.randomUUID()}.${extension}`;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  await uploadPrivateFile('avatars', path, base64, contentType);
  const { error: profileError } = await requireDatabase().from('profiles').update({ avatar_storage_path: path }).eq('id', user.id);
  if (profileError) throw profileError;
  return path;
}

/** Creates a short-lived private URL for showing the current user's avatar. */
export async function getAvatarUrl(path: string) {
  return getPrivateFileUrl('avatars', path);
}

export async function getPendingAvatar(email: string) {
  return SecureStore.getItemAsync(await pendingAvatarKey(email));
}

export async function clearPendingAvatar(email: string) {
  await SecureStore.deleteItemAsync(await pendingAvatarKey(email));
}

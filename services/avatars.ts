import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { requireSupabase } from '@/services/supabase';

function pendingAvatarKey(email: string) { return `sellora_pending_avatar:${email.trim().toLowerCase()}`; }

/** Keeps a selected photo on-device until email confirmation and first sign-in. */
export async function rememberPendingAvatar(email: string, uri: string) {
  await SecureStore.setItemAsync(pendingAvatarKey(email), uri);
}

/** Uploads a selected photo to the signed-in user's private avatar folder. */
export async function uploadProfileAvatar(uri: string) {
  const client = requireSupabase();
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error('Sign in before uploading a profile photo.');
  const extension = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const contentType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  const path = `${session.user.id}/${Crypto.randomUUID()}.${extension}`;
  const response = await fetch(uri);
  const file = await response.blob();
  const { error: uploadError } = await client.storage.from('avatars').upload(path, file, { contentType, upsert: false });
  if (uploadError) throw uploadError;
  const { error: profileError } = await client.from('profiles').update({ avatar_storage_path: path }).eq('id', session.user.id);
  if (profileError) throw profileError;
  return path;
}

/** Creates a short-lived private URL for showing the current user's avatar. */
export async function getAvatarUrl(path: string) {
  const { data, error } = await requireSupabase().storage.from('avatars').createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function getPendingAvatar(email: string) {
  return SecureStore.getItemAsync(pendingAvatarKey(email));
}

export async function clearPendingAvatar(email: string) {
  await SecureStore.deleteItemAsync(pendingAvatarKey(email));
}

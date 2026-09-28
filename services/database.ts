import 'react-native-url-polyfill/auto';
import { PostgrestClient } from '@supabase/postgrest-js';
import { requireAuthClient } from '@/services/authClient';
import { getApiUrl } from '@/services/apiUrl';

const apiUrl = getApiUrl();
let cachedToken: { value: string; expiresAt: number } | null = null;

/** Obtains a short-lived, row-level-security-bound token from the Sellora API. */
async function getDatabaseToken(): Promise<string | null> {
  if (!apiUrl) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 15_000) return cachedToken.value;
  const cookie = await requireAuthClient().getCookie();
  if (!cookie) return null;
  const response = await fetch(`${apiUrl}/api/db-token`, { headers: { Cookie: cookie } });
  if (response.status === 401) { cachedToken = null; return null; }
  if (!response.ok) throw new Error('Could not authorize database access.');
  const body = await response.json() as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

/** Database-only client; auth, storage, and realtime are served by Sellora or SQLite. */
const authorizedFetch: typeof fetch = async (input, init) => {
  const token = await getDatabaseToken();
  const headers = new Headers(init?.headers);
  headers.set('apikey', 'sellora-local-public-client');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  else headers.delete('Authorization');
  return fetch(input, { ...init, headers });
};

export const database = apiUrl
  ? new PostgrestClient(`${apiUrl}/rest/v1`, { schema: 'public', headers: { apikey: 'sellora-local-public-client' }, fetch: authorizedFetch })
  : null;

export function requireDatabase() {
  if (!database) throw new Error('Sellora API is not configured. Set EXPO_PUBLIC_API_URL in .env and restart Expo.');
  return database;
}

export function clearDatabaseToken() { cachedToken = null; }

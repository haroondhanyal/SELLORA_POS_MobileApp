import { requireAuthClient } from '@/services/authClient';
import { getApiUrl } from '@/services/apiUrl';

const baseURL = getApiUrl();

/** Sends an authenticated request to the Sellora API using the native session cookie. */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!baseURL) {
    throw new Error('Sellora API is not configured. Set EXPO_PUBLIC_API_URL in .env and restart Expo.');
  }

  const client = requireAuthClient();
  const cookie = await client.getCookie();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (cookie) headers.set('Cookie', cookie);

  const response = await fetch(`${baseURL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
  });
  const payload = await response.json().catch(() => null) as { error?: unknown } | T | null;
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `Sellora API request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload as T;
}

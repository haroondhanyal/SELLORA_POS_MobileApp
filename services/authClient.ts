import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { getApiUrl } from '@/services/apiUrl';

const baseURL = getApiUrl();

/** Native Better Auth client; sessions and cookies are kept in SecureStore. */
export const authClient = baseURL
  ? createAuthClient({
      baseURL,
      plugins: [
        expoClient({
          scheme: 'sellora',
          storagePrefix: 'sellora',
          storage: SecureStore,
        }),
      ],
    })
  : null;

export function requireAuthClient() {
  if (!authClient) {
    throw new Error('Sellora API is not configured. Set EXPO_PUBLIC_API_URL in .env and restart Expo.');
  }
  return authClient;
}

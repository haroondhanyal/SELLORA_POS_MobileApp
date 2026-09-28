import Constants from 'expo-constants';

/** Uses an explicit server URL in production and Expo's LAN host during local development. */
export function getApiUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;
  const hostUri = Constants.expoConfig?.hostUri
    ?? (Constants as typeof Constants & { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } }).manifest2?.extra?.expoGo?.debuggerHost;
  const host = hostUri?.split(':')[0];
  return host ? `http://${host}:4100` : '';
}

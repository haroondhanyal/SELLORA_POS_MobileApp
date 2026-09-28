import * as SecureStore from 'expo-secure-store';
import { getApiUrl } from '@/services/apiUrl';

const workModeKey = 'sellora_work_mode';

/** Checks the app's API and database health instead of assuming internet means online. */
export async function isApiReachable(timeoutMs = 2500) {
  const baseURL = getApiUrl();
  if (!baseURL) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseURL}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Returns true when the user selected offline mode or the Sellora server is unreachable. */
export async function isOfflineWorkMode() {
  if (await SecureStore.getItemAsync(workModeKey) === 'offline') return true;
  return !(await isApiReachable());
}

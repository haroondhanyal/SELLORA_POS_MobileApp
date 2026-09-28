import * as SecureStore from 'expo-secure-store';

const SAVED_LOGIN_KEY = 'sellora_saved_login_v1';
export type SavedLogin = { email: string; password: string };

/** Reads the opt-in login autofill from the operating system's secure store. */
export async function loadSavedLogin(): Promise<SavedLogin | null> {
  const value = await SecureStore.getItemAsync(SAVED_LOGIN_KEY);
  if (!value) return null;
  try {
    const saved = JSON.parse(value) as Partial<SavedLogin>;
    if (typeof saved.email === 'string' && typeof saved.password === 'string') {
      return { email: saved.email, password: saved.password };
    }
  } catch { /* Remove malformed or outdated saved data below. */ }
  await SecureStore.deleteItemAsync(SAVED_LOGIN_KEY);
  return null;
}

/** Stores credentials only after the user explicitly opts in and signs in. */
export async function saveLogin(login: SavedLogin) {
  await SecureStore.setItemAsync(SAVED_LOGIN_KEY, JSON.stringify(login), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function clearSavedLogin() {
  await SecureStore.deleteItemAsync(SAVED_LOGIN_KEY);
}

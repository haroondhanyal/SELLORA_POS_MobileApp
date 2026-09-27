import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getThemePalette, type ThemeMode, type ThemeName } from '@/theme/themes';

type Preferences = { name: ThemeName; mode: ThemeMode };
type ThemeState = Preferences & { colors: ReturnType<typeof getThemePalette>; setPreferences: (next: Preferences) => Promise<void> };
const ThemeContext = createContext<ThemeState | null>(null);

/** Loads the saved appearance preferences and provides a shared palette to UI components. */
export function ThemeProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext(); const systemMode = useColorScheme();
  const [preferences, setPreferencesState] = useState<Preferences>({ name: 'sellora', mode: 'system' });
  useEffect(() => {
    db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'theme_preferences'").then((row) => {
      if (!row) return;
      try { const saved = JSON.parse(row.value) as Preferences; setPreferencesState({ name: saved.name, mode: saved.mode }); } catch { /* Keep the default if the saved setting is invalid. */ }
    }).catch(() => {});
  }, [db]);
  async function setPreferences(next: Preferences) {
    await db.runAsync("INSERT INTO app_settings (key, value, updated_at) VALUES ('theme_preferences', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP", JSON.stringify(next));
    setPreferencesState(next);
  }
  const resolvedMode = preferences.mode === 'system' ? (systemMode === 'dark' ? 'dark' : 'light') : preferences.mode;
  const value = useMemo(() => ({ ...preferences, colors: getThemePalette(preferences.name, resolvedMode), setPreferences }), [preferences, resolvedMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be called inside ThemeProvider.');
  return theme;
}

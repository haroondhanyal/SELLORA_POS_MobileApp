import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { OptionPicker } from '@/components/OptionPicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { themeNames, type ThemeMode, type ThemeName } from '@/theme/themes';
import { colors } from '@/theme/colors';

/** Lets each user choose a named Sellora palette and light, dark or system mode. */
export default function AppearanceSettingsScreen() {
  const { profile, session, locked } = useAuth();
  const { name, mode, setPreferences } = useTheme();

  async function update(next: { name: ThemeName; mode: ThemeMode }) {
    try { await setPreferences(next); }
    catch (error) { Alert.alert('Could not save appearance', error instanceof Error ? error.message : 'Please try again.'); }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Appearance</Text>
        <Text style={styles.help}>These choices are saved on this device and apply to your Sellora screens.</Text>
        <OptionPicker label="Color theme" value={name} options={themeNames.map((id) => ({ id, label: label(id) }))} onChange={(value) => { if (value && isThemeName(value)) void update({ name: value, mode }); }} />
        <OptionPicker label="Brightness" value={mode} options={(['system', 'light', 'dark'] as const).map((id) => ({ id, label: label(id) }))} onChange={(value) => { if (value && isThemeMode(value)) void update({ name, mode: value }); }} />
      </View>
    </Screen>
  );
}

function isThemeName(value: string): value is ThemeName { return (themeNames as readonly string[]).includes(value); }
function isThemeMode(value: string): value is ThemeMode { return ['system', 'light', 'dark'].includes(value); }
function label(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

const styles = StyleSheet.create({
  page: { paddingBottom: 30 },
  title: { color: colors.navy, fontSize: 27, fontWeight: '800', marginTop: 24 },
  help: { color: colors.muted, lineHeight: 21, marginTop: 6 },
});

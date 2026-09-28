import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/AppButton';
import { Brand } from '@/components/Brand';
import { Screen } from '@/components/Screen';
import { AppearanceToggle } from '@/components/AppearanceToggle';
import { useTheme } from '@/theme/ThemeProvider';

/** Separate entry screen for existing administrators and administrator applicants. */
export default function AdministratorPortalScreen() {
  const theme = useTheme();
  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.header}><Brand /><AppearanceToggle /></View>
        <View>
          <Text style={[styles.title, { color: theme.colors.text }]}>Administrator portal</Text>
          <Text style={[styles.body, { color: theme.colors.muted }]}>Sign in to review team requests, or submit a separate request for administrator access.</Text>
          <Text style={[styles.notice, { color: theme.colors.tealDark, backgroundColor: theme.colors.surfaceTint, borderColor: theme.colors.border }]}>Administrator signup stays pending until an authorized administrator approves it. The first administrator is initialized once by the database owner.</Text>
        </View>
        <View>
          <AppButton title="Administrator sign in" onPress={() => router.push({ pathname: '/auth/login', params: { mode: 'admin' } })} />
          <AppButton title="Request administrator access" secondary onPress={() => router.push({ pathname: '/auth/signup', params: { mode: 'admin' } })} />
          <AppButton title="Back" secondary onPress={() => router.replace('/welcome')} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'space-between', paddingVertical: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 29, fontWeight: '900' },
  body: { fontSize: 15, lineHeight: 23, marginTop: 10 },
  notice: { borderWidth: 1, borderRadius: 12, padding: 14, lineHeight: 21, marginTop: 20 },
});

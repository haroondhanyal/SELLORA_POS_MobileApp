import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Brand } from '@/components/Brand';
import { AppButton } from '@/components/AppButton';
import { AppearanceToggle } from '@/components/AppearanceToggle';
import { useTheme } from '@/theme/ThemeProvider';

/** Welcomes store teams and points new and returning users to the right entry. */
export default function WelcomeScreen() {
  const theme = useTheme();
  return <Screen>
    <View style={styles.page}>
      <View style={styles.top}><Brand /><AppearanceToggle /></View>

      <View style={[styles.hero, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <View style={[styles.art, { backgroundColor: theme.colors.surfaceTint, borderColor: theme.colors.border }]}>
          <View style={[styles.artCircle, { backgroundColor: theme.colors.teal }]}>
            <Brand markOnly />
          </View>
          <View style={[styles.artBadge, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.badgeIcon, { color: theme.colors.tealDark }]}>✓</Text>
          </View>
        </View>
        <Text style={[styles.eyebrow, { color: theme.colors.tealDark }]}>SELL SMARTER. MANAGE ANYWHERE.</Text>
        <Text style={[styles.title, { color: theme.colors.text }]}>Your store, all in one place.</Text>
        <Text style={[styles.body, { color: theme.colors.muted }]}>Manage sales, stock and your team from one simple mobile workspace.</Text>
        <View style={styles.features}>
          <Feature icon="▤" label="Sales" theme={theme} />
          <Feature icon="▦" label="Inventory" theme={theme} />
          <Feature icon="⌂" label="Branches" theme={theme} />
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton title="Create account" onPress={() => router.push('/auth/signup')} />
        <AppButton title="Sign in" secondary onPress={() => router.push('/auth/login')} />
        <AppButton title="Administrator portal" secondary onPress={() => router.push('/auth/admin-portal')} />
        <AppButton title="Login as guest · Explore demo" secondary onPress={() => router.push('/guest')} />
        <Text style={[styles.footer, { color: theme.colors.muted }]}>Secure access for your retail team</Text>
      </View>
    </View>
  </Screen>;
}

function Feature({ icon, label, theme }: { icon: string; label: string; theme: ReturnType<typeof useTheme> }) {
  return <View style={[styles.feature, { backgroundColor: theme.colors.surfaceTint, borderColor: theme.colors.border }]}>
    <Text style={[styles.featureIcon, { color: theme.colors.tealDark }]}>{icon}</Text>
    <Text style={[styles.featureText, { color: theme.colors.text }]}>{label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'space-between', gap: 22, paddingVertical: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  hero: { borderWidth: 1, borderRadius: 28, padding: 22, alignItems: 'flex-start' },
  art: { width: '100%', height: 176, borderWidth: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 22, overflow: 'hidden' },
  artCircle: { width: 116, height: 116, borderRadius: 34, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-7deg' }] },
  artBadge: { position: 'absolute', right: '24%', bottom: 24, width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badgeIcon: { fontSize: 22, fontWeight: '900' },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, fontWeight: '900', marginBottom: 8 },
  title: { fontSize: 29, lineHeight: 35, fontWeight: '900' },
  body: { fontSize: 15, lineHeight: 23, marginTop: 10 },
  features: { flexDirection: 'row', gap: 8, marginTop: 20, flexWrap: 'wrap' },
  feature: { minHeight: 36, borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  featureIcon: { fontSize: 14, fontWeight: '900' },
  featureText: { fontSize: 12, fontWeight: '700' },
  actions: { gap: 0 },
  footer: { fontSize: 12, textAlign: 'center', marginTop: 14 },
});

import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Brand } from '@/components/Brand';
import { AppButton } from '@/components/AppButton';
import { colors } from '@/theme/colors';

/** Branded launch/welcome screen; session routing is handled by the root route. */
export default function SplashScreen() {
  return <Screen><View style={styles.page}><View style={styles.center}><Brand markOnly /><Text style={styles.title}>Retail, made simpler.</Text><Text style={styles.body}>Sales, stock and your team — in one mobile app.</Text></View><View><AppButton title="Get started" onPress={() => router.push('/welcome')} /><AppButton title="I already have an account" secondary onPress={() => router.push('/auth/login')} /></View></View></Screen>;
}

const styles = StyleSheet.create({ page: { flex: 1, justifyContent: 'space-between', paddingTop: 80, paddingBottom: 24 }, center: { alignItems: 'center', gap: 20 }, title: { fontSize: 30, fontWeight: '800', color: colors.navy, textAlign: 'center', marginTop: 58 }, body: { color: colors.muted, fontSize: 16, textAlign: 'center', lineHeight: 24, maxWidth: 280 } });

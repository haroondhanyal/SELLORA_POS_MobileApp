import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Brand } from '@/components/Brand';
import { AppButton } from '@/components/AppButton';
import { colors } from '@/theme/colors';

/** Entry choices for new and returning Sellora users. */
export default function WelcomeScreen() {
  return <Screen><View style={styles.content}><Brand /><View style={styles.copy}><Text style={styles.title}>Welcome to Sellora</Text><Text style={styles.body}>Sign in to manage your store, or create an account and request access from your administrator.</Text></View><AppButton title="Create account" onPress={() => router.push('/auth/signup')} /><AppButton title="Sign in" secondary onPress={() => router.push('/auth/login')} /></View></Screen>;
}

const styles = StyleSheet.create({ content: { flex: 1, justifyContent: 'space-between', paddingVertical: 30 }, copy: { gap: 12 }, title: { color: colors.navy, fontSize: 29, fontWeight: '800' }, body: { color: colors.muted, fontSize: 16, lineHeight: 24 } });

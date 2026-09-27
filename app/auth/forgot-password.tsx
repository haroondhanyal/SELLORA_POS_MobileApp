import { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { FormField } from '@/components/FormField';
import { AppButton } from '@/components/AppButton';
import { sendPasswordReset } from '@/services/auth';
import { colors } from '@/theme/colors';

/** Sends a real password recovery email through Supabase Auth. */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false);
  async function submit() { if (!email.includes('@')) { Alert.alert('Enter your email', 'Use the email address for your Sellora account.'); return; } setBusy(true); try { await sendPasswordReset(email); Alert.alert('Check your inbox', 'If the account exists, Supabase will send a password reset link.'); } catch (error) { Alert.alert('Could not send email', error instanceof Error ? error.message : 'Please try again.'); } finally { setBusy(false); } }
  return <Screen><Text style={styles.title}>Reset password</Text><Text style={styles.body}>We will send a secure reset link to your account email.</Text><FormField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /><AppButton title="Send reset link" onPress={submit} busy={busy} /><Link href="/auth/login" style={styles.link}>Back to sign in</Link></Screen>;
}

const styles = StyleSheet.create({ title: { fontSize: 28, color: colors.navy, fontWeight: '800', marginTop: 20 }, body: { color: colors.muted, marginTop: 8, lineHeight: 22 }, link: { color: colors.tealDark, textAlign: 'center', marginTop: 20, fontWeight: '700' } });

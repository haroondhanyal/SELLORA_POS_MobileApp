import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { PasswordField } from '@/components/PasswordField';
import { AppButton } from '@/components/AppButton';
import { requireSupabase } from '@/services/supabase';
import { colors } from '@/theme/colors';

/** Completes a password reset after Supabase returns to the Sellora deep link. */
export default function ResetPasswordScreen() {
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [busy, setBusy] = useState(false);
  async function submit() {
    if (password.length < 8 || password !== confirmation) { Alert.alert('Check your password', 'Use at least 8 characters and make both entries match.'); return; }
    setBusy(true);
    try { const client = requireSupabase(); const { error } = await client.auth.updateUser({ password }); if (error) throw error; await client.auth.signOut(); Alert.alert('Password updated', 'Sign in with your new password.', [{ text: 'Continue', onPress: () => router.replace('/auth/login') }]); }
    catch (error) { Alert.alert('Could not reset password', error instanceof Error ? error.message : 'Open a fresh recovery email and try again.'); }
    finally { setBusy(false); }
  }
  return <Screen><View><Text style={styles.title}>Choose a new password</Text><Text style={styles.body}>Make it at least 8 characters long.</Text><PasswordField label="New password" value={password} onChangeText={setPassword} /><PasswordField label="Confirm password" value={confirmation} onChangeText={setConfirmation} /><AppButton title="Update password" onPress={submit} busy={busy} /></View></Screen>;
}

const styles = StyleSheet.create({ title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 }, body: { color: colors.muted, lineHeight: 22, marginTop: 8 } });

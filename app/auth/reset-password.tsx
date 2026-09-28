import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { PasswordField } from '@/components/PasswordField';
import { AppButton } from '@/components/AppButton';
import { authClient } from '@/services/authClient';
import { useLocalSearchParams } from 'expo-router';
import { signOut } from '@/services/auth';
import { colors } from '@/theme/colors';

/** Completes a Better Auth password reset from a one-time recovery token. */
export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [busy, setBusy] = useState(false);
  async function submit() {
    if (password.length < 8 || password !== confirmation) { Alert.alert('Check your password', 'Use at least 8 characters and make both entries match.'); return; }
    setBusy(true);
    try {
      if (!token || !authClient) throw new Error('Open the latest password recovery link. If you cannot receive email, ask an administrator to reset your account.');
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) throw new Error(result.error.message);
      await signOut().catch(() => {});
      Alert.alert('Password updated', 'Sign in with your new password.', [{ text: 'Continue', onPress: () => router.replace('/auth/login') }]);
    }
    catch (error) { Alert.alert('Could not reset password', error instanceof Error ? error.message : 'Open a fresh recovery email and try again.'); }
    finally { setBusy(false); }
  }
  return <Screen><View><Text style={styles.title}>Choose a new password</Text><Text style={styles.body}>Make it at least 8 characters long.</Text><PasswordField label="New password" value={password} onChangeText={setPassword} /><PasswordField label="Confirm password" value={confirmation} onChangeText={setConfirmation} /><AppButton title="Update password" onPress={submit} busy={busy} /></View></Screen>;
}

const styles = StyleSheet.create({ title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 }, body: { color: colors.muted, lineHeight: 22, marginTop: 8 } });

import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { FormField } from '@/components/FormField';
import { PasswordField } from '@/components/PasswordField';
import { AppButton } from '@/components/AppButton';
import { signIn } from '@/services/auth';
import { clearDevicePin } from '@/services/pin';
import { colors } from '@/theme/colors';

/** Verifies the account password, then removes the local PIN so a new one can be set. */
export default function ForgotPinScreen() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false);
  async function submit() {
    if (!email.includes('@') || !password) { Alert.alert('Enter account details', 'Use your Sellora email and password to reset this device PIN.'); return; }
    setBusy(true);
    try { await signIn(email, password); await clearDevicePin(); router.replace('/profile'); }
    catch (error) { Alert.alert('Could not verify account', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <Screen><View><Text style={styles.title}>Reset device PIN</Text><Text style={styles.body}>For security, verify with your account password. You can choose a new PIN in your profile.</Text><FormField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /><PasswordField value={password} onChangeText={setPassword} /><AppButton title="Verify and reset PIN" onPress={submit} busy={busy} /></View></Screen>;
}

const styles = StyleSheet.create({ title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 }, body: { color: colors.muted, lineHeight: 23, marginTop: 8 } });

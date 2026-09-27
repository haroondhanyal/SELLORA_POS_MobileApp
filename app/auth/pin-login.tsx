import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { FormField } from '@/components/FormField';
import { PinField } from '@/components/PinField';
import { RolePicker } from '@/components/RolePicker';
import { AppButton } from '@/components/AppButton';
import { verifyDevicePin } from '@/services/pin';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme/colors';
import type { UserRole } from '@/types/auth';

/** Unlocks a previously authenticated device session using its locally stored PIN verifier. */
export default function PinLoginScreen() {
  const [email, setEmail] = useState(''); const [pin, setPin] = useState(''); const [role, setRole] = useState<UserRole>('cashier'); const [busy, setBusy] = useState(false); const { unlock, session, profile } = useAuth();
  useEffect(() => {
    if (session?.user.email) setEmail(session.user.email);
    if (profile) setRole(profile.approval_status === 'approved' ? profile.role : profile.requested_role);
  }, [session?.user.email, profile?.id, profile?.role, profile?.requested_role, profile?.approval_status]);
  async function submit() {
    if (pin.length < 4) { Alert.alert('Enter your PIN', 'Your PIN must have at least 4 digits.'); return; }
    setBusy(true);
    try {
      const valid = await verifyDevicePin(pin, email);
      if (!valid) { Alert.alert('PIN not accepted', 'Check your email and PIN. After several wrong attempts, wait 30 seconds or reset your PIN with your password.'); return; }
      const accountRole = profile?.approval_status === 'approved' ? profile.role : profile?.requested_role;
      if (accountRole && accountRole !== role) {
        Alert.alert('Role does not match', `This account uses ${accountRole.replaceAll('_', ' ')} access. Choose that role and try again.`);
        return;
      }
      unlock(); router.replace('/');
    } catch (error) { Alert.alert('Could not unlock', error instanceof Error ? error.message : 'Please sign in with your password.'); }
    finally { setBusy(false); }
  }
  return <Screen><View><Text style={styles.title}>Unlock with PIN</Text><Text style={styles.body}>{session ? 'Enter the email, role and device PIN for this saved Sellora session.' : 'PIN unlock needs a saved signed-in session on this device. Sign in with your password first.'}</Text><FormField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /><RolePicker label="Sign in as" value={role} onChange={setRole} /><PinField label="Device PIN" value={pin} onChangeText={setPin} /><AppButton title="Unlock Sellora" onPress={submit} busy={busy} disabled={!session} /><Link href="/auth/forgot-pin" style={styles.link}>Forgot PIN? Verify with password</Link></View></Screen>;
}

const styles = StyleSheet.create({ title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 20 }, body: { color: colors.muted, lineHeight: 23, marginTop: 12 }, link: { color: colors.tealDark, textAlign: 'center', marginTop: 22, fontWeight: '700' } });

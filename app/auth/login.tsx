import { useState } from 'react';
import { Link, router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/AppButton';
import { Brand } from '@/components/Brand';
import { FormField } from '@/components/FormField';
import { PasswordField } from '@/components/PasswordField';
import { PinField } from '@/components/PinField';
import { RolePicker } from '@/components/RolePicker';
import { AppearanceToggle } from '@/components/AppearanceToggle';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { getPendingAvatar, uploadProfileAvatar, clearPendingAvatar } from '@/services/avatars';
import { getMyProfile, signIn } from '@/services/auth';
import { activateSignupPin, verifyDevicePin } from '@/services/pin';
import { requireSupabase } from '@/services/supabase';
import { colors } from '@/theme/colors';
import type { UserRole } from '@/types/auth';
import { useTheme } from '@/theme/ThemeProvider';

/** Signs in with email/password and checks the selected role against the profile. */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [method, setMethod] = useState<'password' | 'pin'>('password');
  const [role, setRole] = useState<UserRole>('cashier');
  const [busy, setBusy] = useState(false);
  const { reloadProfile, session, profile, unlock } = useAuth();
  const theme = useTheme();

  async function submitLogin() {
    if (method === 'pin') {
      if (!session) {
        Alert.alert('Sign in with password first', 'A device PIN unlocks a saved Sellora session on this device.');
        return;
      }
      if (pin.length < 4) {
        Alert.alert('Enter your PIN', 'Your device PIN must have at least 4 digits.');
        return;
      }
      setBusy(true);
      try {
        const valid = await verifyDevicePin(pin, email || session.user.email || '');
        if (!valid) {
          Alert.alert('PIN not accepted', 'Check the account email and PIN. If needed, sign in with your password.');
          return;
        }
        const accountRole = profile?.approval_status === 'approved' ? profile.role : profile?.requested_role;
        if (accountRole && accountRole !== role) {
          Alert.alert('Role does not match', `This account uses ${accountRole.replaceAll('_', ' ')} access. Choose that role and try again.`);
          return;
        }
        unlock();
        router.replace('/');
      } catch (error) {
        Alert.alert('Could not unlock', error instanceof Error ? error.message : 'Please try again.');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!email.trim() || !email.includes('@') || password.length < 8) {
      Alert.alert('Check your details', 'Enter a valid email and a password with at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      await signIn(email, password);
      const profile = await getMyProfile();
      const assignedOrRequestedRole = profile?.approval_status === 'approved'
        ? profile.role
        : profile?.requested_role;

      if (assignedOrRequestedRole && assignedOrRequestedRole !== role) {
        await requireSupabase().auth.signOut();
        Alert.alert(
          'Role does not match',
          `This account uses ${assignedOrRequestedRole.replaceAll('_', ' ')} access. Choose that role and try again.`,
        );
        return;
      }

      // Email-confirmed signups can now attach their securely stored PIN verifier.
      await activateSignupPin(email);
      await uploadRememberedSignupPhoto(email);
      await reloadProfile();
      router.replace('/');
    } catch (error) {
      Alert.alert('Could not sign in', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // Uploads a photo selected during signup after the email is confirmed and the user signs in.
  async function uploadRememberedSignupPhoto(accountEmail: string) {
    const photoUri = await getPendingAvatar(accountEmail);
    if (!photoUri) return;

    try {
      await uploadProfileAvatar(photoUri);
      await clearPendingAvatar(accountEmail);
    } catch {
      Alert.alert('Photo not uploaded', 'You are signed in. You can upload your photo from Edit profile.');
    }
  }

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.authHeader}><Brand /><AppearanceToggle /></View>
        <View>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Choose your role and use your Sellora account details.</Text>
          <RolePicker label="Sign in as" value={role} onChange={setRole} />
          <View style={styles.methodPicker}>
            {(['password', 'pin'] as const).map((option) => {
              const selected = method === option;
              return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setMethod(option)} style={[styles.method, { borderColor: selected ? theme.colors.tealDark : theme.colors.border, backgroundColor: selected ? theme.colors.surfaceTint : theme.colors.surface }]}>
                <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{selected ? '✓ ' : ''}{option === 'password' ? 'Password' : 'Device PIN'}</Text>
              </Pressable>;
            })}
          </View>
          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          {method === 'password' ? <PasswordField
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            showStrength={false}
          /> : <>
            <PinField label="Device PIN" value={pin} onChangeText={setPin} />
            <Text style={[styles.pinHelp, { color: theme.colors.muted }]}>{session ? 'Enter the PIN saved for this device.' : 'Device PIN works after signing in with your password on this device.'}</Text>
          </>}
          {method === 'password' ? <Link href="/auth/forgot-password" style={[styles.link, { color: theme.colors.tealDark }]}>Forgot password?</Link> : <Link href="/auth/forgot-pin" style={[styles.link, { color: theme.colors.tealDark }]}>Forgot PIN?</Link>}
        </View>
        <View>
          <AppButton title={method === 'password' ? 'Sign in' : 'Unlock with PIN'} onPress={submitLogin} busy={busy} disabled={method === 'pin' && !session} />
          <Link href="/auth/signup" style={[styles.signupLink, { color: theme.colors.tealDark }]}>New to Sellora? Create account</Link>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'space-between', gap: 28, paddingVertical: 14 },
  authHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  subtitle: { color: colors.muted, marginTop: 6 },
  link: { color: colors.tealDark, textAlign: 'right', marginTop: 14, fontWeight: '700' },
  signupLink: { textAlign: 'center', marginTop: 16, paddingVertical: 8, fontWeight: '800' },
  methodPicker: { flexDirection: 'row', gap: 8, marginTop: 16 },
  method: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pinHelp: { marginTop: 8, lineHeight: 20 },
});

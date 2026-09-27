import { useState } from 'react';
import { Link, router } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/AppButton';
import { Brand } from '@/components/Brand';
import { FormField } from '@/components/FormField';
import { PasswordField } from '@/components/PasswordField';
import { RolePicker } from '@/components/RolePicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { getPendingAvatar, uploadProfileAvatar, clearPendingAvatar } from '@/services/avatars';
import { getMyProfile, signIn } from '@/services/auth';
import { activateSignupPin } from '@/services/pin';
import { requireSupabase } from '@/services/supabase';
import { colors } from '@/theme/colors';
import type { UserRole } from '@/types/auth';

/** Signs in with email/password and checks the selected role against the profile. */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('cashier');
  const [busy, setBusy] = useState(false);
  const { reloadProfile } = useAuth();

  async function submitLogin() {
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
        <Brand />
        <View>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Choose your role and use your Sellora account details.</Text>
          <RolePicker label="Sign in as" value={role} onChange={setRole} />
          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <PasswordField
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            showStrength={false}
          />
          <Link href="/auth/forgot-password" style={styles.link}>Forgot password?</Link>
          <Link href="/auth/forgot-pin" style={styles.link}>Forgot PIN?</Link>
        </View>
        <View>
          <AppButton title="Sign in" onPress={submitLogin} busy={busy} />
          <AppButton
            title="Continue with PIN"
            onPress={() => router.push('/auth/pin-login')}
            secondary
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'space-between', gap: 28, paddingVertical: 14 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  subtitle: { color: colors.muted, marginTop: 6 },
  link: { color: colors.tealDark, textAlign: 'right', marginTop: 14, fontWeight: '700' },
});

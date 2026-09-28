import { useEffect, useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/AppButton';
import { Brand } from '@/components/Brand';
import { CountryCodePicker } from '@/components/CountryCodePicker';
import { DatePickerField } from '@/components/DatePickerField';
import { FormField } from '@/components/FormField';
import { PasswordField } from '@/components/PasswordField';
import { ProfileImagePicker } from '@/components/ProfileImagePicker';
import { PinField } from '@/components/PinField';
import { RolePicker } from '@/components/RolePicker';
import { AppearanceToggle } from '@/components/AppearanceToggle';
import { Screen } from '@/components/Screen';
import { rememberPendingAvatar, uploadProfileAvatar, clearPendingAvatar } from '@/services/avatars';
import { signUp } from '@/services/auth';
import { rememberSignupPin, setDevicePin } from '@/services/pin';
import { colors } from '@/theme/colors';
import type { UserRole } from '@/types/auth';

/** Collects new account details and submits a role request for admin approval. */
export default function SignupScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const administratorRequest = mode === 'admin';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+92');
  const [countryName, setCountryName] = useState('Pakistan');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [role, setRole] = useState<UserRole>(administratorRequest ? 'admin' : 'cashier');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setRole(administratorRequest ? 'admin' : 'cashier'); }, [administratorRequest]);

  async function submitSignup() {
    const cleanName = name.trim().replace(/\s+/g, ' ');
    const cleanEmail = email.trim().toLowerCase();
    const phoneDigits = phone.replace(/\D/g, '');
    const issues: string[] = [];
    if (cleanName.length < 2) issues.push('Enter your full name (at least 2 characters).');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) issues.push('Enter a valid email address, such as name@example.com.');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) issues.push('Enter a phone number with 7 to 15 digits.');
    if (!isValidBirthDate(birthday)) issues.push('Choose a valid date of birth that is not in the future.');
    if (password.length < 8 || password.length > 128) issues.push('Password must be 8 to 128 characters.');
    if (password !== confirmPassword) issues.push('The passwords do not match.');
    if (!/^\d{4,6}$/.test(pin)) issues.push('Security PIN must contain 4 to 6 digits.');
    if (pin !== confirmPin) issues.push('The security PINs do not match.');

    if (issues.length) {
      Alert.alert('Check your details', issues.join('\n'));
      return;
    }

    setBusy(true);
    try {
      const fullPhone = `${countryCode} ${phoneDigits}`;
      const result = await signUp({
        name: cleanName,
        email: cleanEmail,
        password,
        phone: fullPhone,
        dateOfBirth: formatDate(birthday!),
        role,
      });

      const signedIn = Boolean((result as { data?: unknown }).data);
      const profileProvisioned = (result as { selloraProfileProvisioned?: boolean }).selloraProfileProvisioned !== false;
      // Better Auth creates a signed-in session immediately; approval still gates app access.
      let pinSaved = true;
      try {
        if (signedIn) await setDevicePin(pin);
        else await rememberSignupPin(cleanEmail, pin);
      } catch {
        pinSaved = false;
      }

      let photoSaved = true;
      try {
        await saveSignupPhotoIfSelected(signedIn);
      } catch {
        photoSaved = false;
      }

      const message = `${signedIn
        ? 'Your account is waiting for administrator approval.'
        : 'Sign in to finish setting up your account.'}${profileProvisioned ? '' : ' Your account was created, but its Sellora profile could not be loaded yet. It will be retried when you sign in with the server available.'}${pinSaved ? '' : ' You can set your device PIN after signing in.'}${photoSaved ? '' : ' Your account was created, but the profile photo was not saved; add it later from your profile.'}`;

      Alert.alert('Account request sent', message, [
        { text: 'Continue', onPress: () => router.replace('/auth/pending-approval') },
      ]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Please try again.';
      Alert.alert(
        'Could not create account',
        errorMessage,
      );
    } finally {
      setBusy(false);
    }
  }

  // Email-confirmation accounts upload the chosen photo the first time they sign in.
  async function saveSignupPhotoIfSelected(hasSession: boolean) {
    if (!avatarUri) return;
    if (!hasSession) {
      await rememberPendingAvatar(email.trim().toLowerCase(), avatarUri);
      return;
    }

    try {
      await uploadProfileAvatar(avatarUri);
      await clearPendingAvatar(email.trim().toLowerCase());
    } catch {
      await rememberPendingAvatar(email.trim().toLowerCase(), avatarUri);
    }
  }

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.authHeader}><Brand /><AppearanceToggle /></View>
        <View>
          <Text style={styles.title}>{administratorRequest ? 'Request administrator access' : 'Create account'}</Text>
          <Text style={styles.subtitle}>{administratorRequest ? 'This separate request is for administrator access. An existing administrator must approve it; signup cannot grant admin access by itself.' : 'Your administrator will review this access request.'}</Text>

          <ProfileImagePicker label="Profile photo (max 25 MB)" uri={avatarUri} onChange={setAvatarUri} />
          <FormField label="Full name" placeholder="Enter your full name" value={name} onChangeText={setName} autoComplete="name" />
          <FormField
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <View style={styles.phoneRow}>
            <CountryCodePicker value={countryCode} countryName={countryName} onChange={(code, name) => { setCountryCode(code); if (name) setCountryName(name); }} compact />
            <View style={styles.phoneInput}><FormField label="Phone number" placeholder="300 1234567" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /></View>
          </View>
          <DatePickerField label="Date of birth" value={birthday} onChange={setBirthday} />
          <PasswordField value={password} onChangeText={setPassword} />
          <PasswordField
            label="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoComplete="new-password"
          />
          <PinField label="Security PIN (4–6 digits)" value={pin} onChangeText={setPin} />
          <PinField label="Confirm security PIN" value={confirmPin} onChangeText={setConfirmPin} />
          {administratorRequest ? null : <RolePicker value={role} onChange={setRole} includeAdmin={false} />}
        </View>
        <AppButton title={administratorRequest ? 'Send administrator request' : 'Send account request'} onPress={submitSignup} busy={busy} />
        <Link href={administratorRequest ? { pathname: '/auth/login', params: { mode: 'admin' } } : '/auth/login'} style={styles.signInLink}>{administratorRequest ? 'Already an administrator? Sign in' : 'Already have an account? Sign in'}</Link>
      </View>
    </Screen>
  );
}

function isValidBirthDate(date: Date | null): date is Date {
  if (!date || Number.isNaN(date.getTime())) return false;
  const today = new Date();
  const selectedDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return selectedDay <= todayDay;
}

/** Formats a calendar date without shifting it to another UTC day. */
function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const styles = StyleSheet.create({
  page: { gap: 22, paddingBottom: 24 },
  authHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  phoneRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  phoneInput: { flex: 1 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  subtitle: { color: colors.muted, marginTop: 6, lineHeight: 21 },
  signInLink: { color: colors.tealDark, textAlign: 'center', fontWeight: '800', paddingVertical: 12 },
});

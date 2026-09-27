import { useState } from 'react';
import { router } from 'expo-router';
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
import { Screen } from '@/components/Screen';
import { rememberPendingAvatar, uploadProfileAvatar, clearPendingAvatar } from '@/services/avatars';
import { signUp } from '@/services/auth';
import { rememberSignupPin, setDevicePin } from '@/services/pin';
import { colors } from '@/theme/colors';
import type { UserRole } from '@/types/auth';

/** Collects new account details and submits a role request for admin approval. */
export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+92');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [role, setRole] = useState<UserRole>('cashier');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitSignup() {
    const hasValidBirthday = Boolean(birthday && birthday <= new Date());
    const hasValidDetails = name.trim().length >= 2
      && email.includes('@')
      && phone.trim().length >= 7
      && hasValidBirthday
      && password.length >= 8
      && password === confirmPassword
      && /^\d{4,6}$/.test(pin)
      && pin === confirmPin;

    if (!hasValidDetails) {
      Alert.alert(
        'Check your details',
        'Check your name, email, phone and date of birth. Passwords must match and PINs must match using 4 to 6 digits.',
      );
      return;
    }

    setBusy(true);
    try {
      const fullPhone = `${countryCode} ${phone.trim()}`;
      const result = await signUp({
        name,
        email,
        password,
        phone: fullPhone,
        dateOfBirth: formatDate(birthday!),
        role,
      });

      // Save the PIN verifier now, or keep it securely until email confirmation enables sign-in.
      let pinSaved = true;
      try {
        if (result.session) await setDevicePin(pin);
        else await rememberSignupPin(email, pin);
      } catch {
        pinSaved = false;
      }

      await saveSignupPhotoIfSelected(result.session !== null);

      const message = `${result.session
        ? 'Your account is waiting for administrator approval.'
        : 'Check your email to confirm your account, then wait for administrator approval.'}${pinSaved ? '' : ' Sign in after confirmation to set your device PIN.'}`;

      Alert.alert('Account request sent', message, [
        { text: 'Continue', onPress: () => router.replace('/auth/pending-approval') },
      ]);
    } catch (error) {
      Alert.alert(
        'Could not create account',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  // Email-confirmation accounts upload the chosen photo the first time they sign in.
  async function saveSignupPhotoIfSelected(hasSession: boolean) {
    if (!avatarUri) return;
    if (!hasSession) {
      await rememberPendingAvatar(email, avatarUri);
      return;
    }

    try {
      await uploadProfileAvatar(avatarUri);
      await clearPendingAvatar(email);
    } catch {
      await rememberPendingAvatar(email, avatarUri);
    }
  }

  return (
    <Screen>
      <View style={styles.page}>
        <Brand />
        <View>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Your administrator will review this access request.</Text>

          <ProfileImagePicker uri={avatarUri} onChange={setAvatarUri} />
          <FormField label="Full name" value={name} onChangeText={setName} autoComplete="name" />
          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <CountryCodePicker value={countryCode} onChange={setCountryCode} />
          <FormField label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
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
          <RolePicker value={role} onChange={setRole} />
        </View>
        <AppButton title="Send account request" onPress={submitSignup} busy={busy} />
      </View>
    </Screen>
  );
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
  title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  subtitle: { color: colors.muted, marginTop: 6, lineHeight: 21 },
});

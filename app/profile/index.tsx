import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { CountryCodePicker } from '@/components/CountryCodePicker';
import { DatePickerField } from '@/components/DatePickerField';
import { FormField } from '@/components/FormField';
import { PinField } from '@/components/PinField';
import { ProfileImagePicker } from '@/components/ProfileImagePicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { getAvatarUrl, uploadProfileAvatar } from '@/services/avatars';
import { clearDevicePin, hasDevicePin, setDevicePin } from '@/services/pin';
import { requireSupabase } from '@/services/supabase';
import { colors } from '@/theme/colors';

/** Edits personal details and manages the account's photo and device PIN. */
export default function ProfileScreen() {
  const { profile, session, locked, reloadProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [countryCode, setCountryCode] = useState('+92');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [removedPhoto, setRemovedPhoto] = useState(false);
  const [savedAvatarUrl, setSavedAvatarUrl] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinConfigured, setPinConfigured] = useState(false);
  const [busy, setBusy] = useState(false);

  // Populate editable fields after the signed-in user's profile has loaded.
  useEffect(() => {
    if (profile?.full_name) setName(profile.full_name);
    if (profile?.phone) {
      const phoneCode = ['+92', '+1', '+44', '+971', '+91']
        .find((code) => profile.phone?.startsWith(`${code} `));

      if (phoneCode) {
        setCountryCode(phoneCode);
        setPhoneDigits(profile.phone.slice(phoneCode.length).trim());
      } else {
        setPhoneDigits(profile.phone);
      }
    }
    if (profile?.date_of_birth) {
      setBirthday(new Date(`${profile.date_of_birth}T12:00:00`));
    }
    if (profile?.avatar_storage_path) {
      getAvatarUrl(profile.avatar_storage_path)
        .then(setSavedAvatarUrl)
        .catch(() => setSavedAvatarUrl(null));
    } else {
      setSavedAvatarUrl(null);
    }
    if (session) {
      hasDevicePin(session.user.id).then(setPinConfigured).catch(() => setPinConfigured(false));
    }
  }, [profile?.id, profile?.full_name, profile?.phone, profile?.date_of_birth, profile?.avatar_storage_path, session?.user.id]);

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  // Save photo and text fields together so the profile shows one consistent result.
  async function saveProfile() {
    if (!profile) return;
    if (name.trim().length < 2 || phoneDigits.trim().length < 7) {
      Alert.alert('Check your details', 'Enter your name and a valid phone number.');
      return;
    }

    setBusy(true);
    try {
      let photoPath = profile.avatar_storage_path;
      if (removedPhoto) photoPath = null;
      else if (photo) photoPath = await uploadProfileAvatar(photo);

      const { error } = await requireSupabase()
        .from('profiles')
        .update({
          full_name: name.trim(),
          phone: `${countryCode} ${phoneDigits.trim()}`,
          date_of_birth: birthday ? formatDate(birthday) : null,
          avatar_storage_path: photoPath,
        })
        .eq('id', profile.id);

      if (error) throw error;

      if (profile.avatar_storage_path && profile.avatar_storage_path !== photoPath) {
        await requireSupabase().storage.from('avatars').remove([profile.avatar_storage_path]);
      }

      await reloadProfile();
      setPhoto(null);
      setRemovedPhoto(false);
      setSavedAvatarUrl(photoPath ? await getAvatarUrl(photoPath) : null);
      Alert.alert('Profile updated', 'Your profile details have been saved.');
    } catch (error) {
      Alert.alert(
        'Could not save profile',
        error instanceof Error ? error.message : 'Please check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  // PIN data is salted and saved in SecureStore by the PIN service.
  async function savePin() {
    if (pin.length < 4 || pin.length > 6 || pin !== confirmPin) {
      Alert.alert('Check your PIN', 'Use 4 to 6 digits and make both entries match.');
      return;
    }

    setBusy(true);
    try {
      await setDevicePin(pin);
      setPinConfigured(true);
      setPin('');
      setConfirmPin('');
      Alert.alert('PIN saved', 'You can now use this PIN to unlock this device session.');
    } catch (error) {
      Alert.alert('Could not save PIN', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function removePin() {
    try {
      await clearDevicePin();
      setPinConfigured(false);
      Alert.alert('PIN removed', 'Password sign-in is required to unlock this device.');
    } catch (error) {
      Alert.alert('Could not remove PIN', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function signOut() {
    try {
      await clearDevicePin();
      await requireSupabase().auth.signOut();
      router.replace('/welcome');
    } catch (error) {
      Alert.alert('Could not sign out', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  const displayedPhoto = photo ?? (removedPhoto ? null : savedAvatarUrl);

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>My profile</Text>
        <Text style={styles.meta}>
          {profile?.role.replaceAll('_', ' ')} · {profile?.approval_status}
        </Text>

        <ProfileImagePicker
          uri={displayedPhoto}
          onChange={(uri) => {
            setPhoto(uri);
            setRemovedPhoto(uri === null);
          }}
        />
        <FormField label="Full name" value={name} onChangeText={setName} autoComplete="name" />
        <FormField label="Email" value={profile?.email ?? ''} editable={false} />
        <CountryCodePicker value={countryCode} onChange={setCountryCode} />
        <FormField
          label="Phone number"
          value={phoneDigits}
          onChangeText={setPhoneDigits}
          keyboardType="phone-pad"
        />
        <DatePickerField label="Date of birth" value={birthday} onChange={setBirthday} />
        <AppButton title="Save profile" onPress={saveProfile} busy={busy} />

        <View style={styles.pinCard}>
          <Text style={styles.pinTitle}>Device PIN</Text>
          <Text style={styles.pinHelp}>
            {pinConfigured
              ? 'PIN unlock is enabled on this device.'
              : 'Set a 4 to 6 digit PIN for quick device unlock.'}
          </Text>
          <PinField label={pinConfigured ? 'New PIN' : 'PIN'} value={pin} onChangeText={setPin} />
          <PinField label="Confirm PIN" value={confirmPin} onChangeText={setConfirmPin} />
          <AppButton title={pinConfigured ? 'Change PIN' : 'Set PIN'} onPress={savePin} busy={busy} />
          <AppButton title="Remove PIN" onPress={removePin} secondary disabled={!pinConfigured} />
        </View>

        <AppButton title="Sign out" onPress={signOut} secondary />
      </View>
    </Screen>
  );
}

/** Formats a calendar date without shifting it to a different UTC day. */
function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const styles = StyleSheet.create({
  page: { gap: 4, paddingBottom: 30 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 25 },
  meta: { color: colors.muted, textTransform: 'capitalize', marginTop: 5 },
  pinCard: { backgroundColor: 'white', borderRadius: 16, borderColor: colors.border, borderWidth: 1, padding: 16, marginTop: 28 },
  pinTitle: { color: colors.navy, fontWeight: '800', fontSize: 18 },
  pinHelp: { color: colors.muted, marginTop: 6, lineHeight: 20 },
});

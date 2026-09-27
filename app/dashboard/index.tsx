import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { canManageRoles, canManageUsers } from '@/services/permissions';
import { clearDevicePin } from '@/services/pin';
import { requireSupabase } from '@/services/supabase';
import { colors } from '@/theme/colors';

/** First approved screen after sign-in; links users to the features they can access. */
export default function DashboardScreen() {
  const { profile, permissionCodes, locked, session } = useAuth();

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!profile || profile.approval_status !== 'approved') {
    return <Redirect href="/auth/pending-approval" />;
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

  const showUserManagement = canManageUsers(profile, permissionCodes);
  const showRoleManagement = canManageRoles(profile, permissionCodes);

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.hello}>Hello, {profile.full_name || 'there'}.</Text>
        <Text style={styles.body}>
          Your Sellora workspace is ready. Product, POS and inventory modules are the next phase.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Your access</Text>
          <Text style={styles.value}>{profile.role.replaceAll('_', ' ')}</Text>
          <Text style={styles.status}>Approved account</Text>
        </View>

        {showUserManagement ? (
          <AppButton title="Manage users & approvals" onPress={() => router.push('/users')} />
        ) : null}
        {showRoleManagement ? (
          <AppButton title="Manage role permissions" onPress={() => router.push('/roles')} />
        ) : null}
        <AppButton title="Edit profile & PIN" onPress={() => router.push('/profile')} secondary />

        <View style={styles.bottom}>
          <AppButton title="Sign out" secondary onPress={signOut} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  hello: { color: colors.navy, fontSize: 30, fontWeight: '800', marginTop: 36 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 10 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginTop: 28, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.muted, fontSize: 13 },
  value: { color: colors.navy, fontSize: 20, fontWeight: '800', textTransform: 'capitalize', marginTop: 8 },
  status: { color: colors.success, fontSize: 13, marginTop: 8, fontWeight: '700' },
  bottom: { flex: 1, justifyContent: 'flex-end' },
});

import { router } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { AppButton } from '@/components/AppButton';
import { useAuth } from '@/providers/AuthProvider';
import { signOut as endSession } from '@/services/auth';
import { colors } from '@/theme/colors';

/** Explains that registration requires administrator approval and offers sign-out. */
export default function PendingApprovalScreen() {
  const { profile, reloadProfile } = useAuth();
  async function refresh() {
    try {
      const account = await reloadProfile();
      if (!account) {
        Alert.alert('Account details unavailable', 'Your sign-in is active, but Sellora could not load your profile. Check your connection and try again.');
        return;
      }
      if (account.approval_status === 'approved') {
        Alert.alert('Access approved', 'Your access is ready. Continue to Sellora.', [
          { text: 'Continue', onPress: () => router.replace(account.role === 'admin' ? '/admin' : '/dashboard') },
        ]);
        return;
      }
      const statusMessage = account.approval_status === 'rejected'
        ? 'Your account request was not approved. Contact your Sellora administrator.'
        : account.approval_status === 'suspended'
          ? 'Your account is suspended. Contact your Sellora administrator.'
          : 'Your request is still waiting for an administrator. Check again after they review it.';
      Alert.alert('Status checked', statusMessage);
    } catch {
      Alert.alert('Could not check status', 'Check your connection and try again.');
    }
  }
  async function signOut() { try { await endSession(); router.replace('/welcome'); } catch (error) { Alert.alert('Could not sign out', error instanceof Error ? error.message : 'Please try again.'); } }
  const profileUnavailable = !profile;
  return <Screen><View style={styles.page}><View style={styles.icon}><Text style={styles.iconText}>{profileUnavailable ? '!' : profile.approval_status === 'approved' ? '✓' : '⌛'}</Text></View><Text style={styles.title}>{profileUnavailable ? 'Account details unavailable' : profile.approval_status === 'approved' ? 'Access approved' : profile.approval_status === 'rejected' ? 'Request not approved' : profile.approval_status === 'suspended' ? 'Account suspended' : 'Waiting for approval'}</Text><Text style={styles.body}>{profileUnavailable ? 'Your sign-in succeeded, but the Sellora profile could not be loaded. Check the API/database connection and retry.' : profile.approval_status === 'approved' ? 'Your access is approved. Check your status to continue to Sellora.' : 'Your account request has been received. An administrator needs to approve your access before you can use Sellora.'}</Text><Text style={styles.note}>{profile ? `Requested role: ${profile.requested_role ?? profile.role}` : 'Your profile will load when the server and database are available.'}</Text><AppButton title="Check approval status" onPress={refresh} /><AppButton title="Sign out" secondary onPress={signOut} /></View></Screen>;
}

const styles = StyleSheet.create({ page: { flex: 1, justifyContent: 'center' }, icon: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#E6F6F1', alignItems: 'center', justifyContent: 'center' }, iconText: { fontSize: 30 }, title: { color: colors.navy, fontWeight: '800', fontSize: 27, marginTop: 24 }, body: { color: colors.muted, fontSize: 15, lineHeight: 24, marginTop: 10 }, note: { color: colors.tealDark, fontWeight: '700', marginTop: 18 } });

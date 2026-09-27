import { router } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { AppButton } from '@/components/AppButton';
import { useAuth } from '@/providers/AuthProvider';
import { requireSupabase } from '@/services/supabase';
import { colors } from '@/theme/colors';

/** Explains that registration requires administrator approval and offers sign-out. */
export default function PendingApprovalScreen() {
  const { profile, reloadProfile } = useAuth();
  async function refresh() { try { await reloadProfile(); Alert.alert('Status checked', 'If the administrator approved you, sign out and sign in again to refresh access.'); } catch { Alert.alert('Could not check status', 'Check your connection and try again.'); } }
  async function signOut() { try { await requireSupabase().auth.signOut(); router.replace('/welcome'); } catch (error) { Alert.alert('Could not sign out', error instanceof Error ? error.message : 'Please try again.'); } }
  return <Screen><View style={styles.page}><View style={styles.icon}><Text style={styles.iconText}>⌛</Text></View><Text style={styles.title}>{profile?.approval_status === 'rejected' ? 'Request not approved' : profile?.approval_status === 'suspended' ? 'Account suspended' : 'Waiting for approval'}</Text><Text style={styles.body}>Your account request has been received. An administrator needs to approve your access before you can use Sellora.</Text><Text style={styles.note}>Requested role: {profile?.role ?? 'Check your email confirmation and sign in to view status'}</Text><AppButton title="Check approval status" onPress={refresh} /><AppButton title="Sign out" secondary onPress={signOut} /></View></Screen>;
}

const styles = StyleSheet.create({ page: { flex: 1, justifyContent: 'center' }, icon: { width: 64, height: 64, borderRadius: 22, backgroundColor: '#E6F6F1', alignItems: 'center', justifyContent: 'center' }, iconText: { fontSize: 30 }, title: { color: colors.navy, fontWeight: '800', fontSize: 27, marginTop: 24 }, body: { color: colors.muted, fontSize: 15, lineHeight: 24, marginTop: 10 }, note: { color: colors.tealDark, fontWeight: '700', marginTop: 18 } });

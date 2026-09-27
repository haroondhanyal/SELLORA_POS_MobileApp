import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme/colors';

/** Chooses the first screen from session and approval state after launch. */
export default function IndexRoute() {
  const { ready, session, profile, locked } = useAuth();
  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.teal} /></View>;
  if (!session) return <Redirect href="/splash" />;
  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!profile || profile.approval_status === 'pending') return <Redirect href="/auth/pending-approval" />;
  if (profile.approval_status !== 'approved') return <Redirect href="/auth/pending-approval" />;
  return <Redirect href="/dashboard" />;
}

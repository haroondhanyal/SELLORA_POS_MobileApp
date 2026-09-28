import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useConnection } from '@/providers/ConnectionProvider';
import { canManageUsers } from '@/services/permissions';
import { requireDatabase } from '@/services/database';
import { loadAdminOverview, type AdminOverview } from '@/services/adminOverview';
import { colors } from '@/theme/colors';

/** Dedicated entry point for approved administrators and account requests. */
export default function AdminPanelScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewCached, setOverviewCached] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const { connected, mode } = useConnection();
  const permitted = canManageUsers(profile, permissionCodes) && profile?.role === 'admin';

  const refreshRequests = useCallback(async () => {
    if (!permitted || !connected || mode !== 'online') return;
    setRefreshing(true);
    try {
      const { count, error } = await requireDatabase().from('profiles')
        .select('id', { count: 'exact', head: true }).eq('approval_status', 'pending');
      if (error) throw error;
      setPendingCount(count ?? 0);
    } catch (error) {
      if (connected && mode === 'online') Alert.alert('Could not check requests', error instanceof Error ? error.message : 'Check your connection and retry.');
    } finally {
      setRefreshing(false);
    }
  }, [permitted, connected, mode]);

  const refreshOverview = useCallback(async () => {
    if (!permitted || !session?.user.id) return;
    try {
      const result = await loadAdminOverview(session.user.id, connected && mode === 'online');
      setOverview(result.overview);
      setOverviewCached(result.cached);
      setOverviewError(null);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : 'Team activity is not available yet.');
    }
  }, [permitted, session?.user.id, connected, mode]);

  useEffect(() => {
    if (!permitted) return;
    void refreshRequests();
    void refreshOverview();
    const interval = setInterval(() => { void refreshRequests(); void refreshOverview(); }, 20_000);
    return () => clearInterval(interval);
  }, [permitted, refreshRequests, refreshOverview]);

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!permitted) return <Redirect href={profile?.approval_status === 'approved' ? '/dashboard' : '/auth/pending-approval'} />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Administrator panel</Text>
        <Text style={styles.help}>Review account requests and manage your Sellora team.</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Account requests waiting</Text>
          <Text style={styles.count}>{pendingCount === null ? '—' : pendingCount}</Text>
          <Text style={styles.help}>{pendingCount === 1 ? '1 person is waiting for review.' : `${pendingCount ?? 'Loading'} people are waiting for review.`}</Text>
        </View>
        <Text style={styles.section}>Team online status</Text>
        <Text style={styles.help}>{overviewCached ? 'Offline snapshot · statuses were last observed' : 'Online when a device checked in during the last 90 seconds.'}{overview ? ` · ${new Date(overview.generatedAt).toLocaleString()}` : ''}</Text>
        {overviewError && !overview ? <Text style={styles.help}>{overviewError}</Text> : null}
        {overview?.team.map((member) => (
          <View key={member.id} style={styles.row}>
            <View style={styles.member}>
              <Text style={styles.name}>{member.full_name || member.email}</Text>
              <Text style={styles.meta}>{member.role.replaceAll('_', ' ')} · {member.online ? `${member.online_devices} device${member.online_devices === 1 ? '' : 's'} active` : member.last_seen_at ? `Last seen ${new Date(member.last_seen_at).toLocaleString()}` : 'No online check-in yet'}</Text>
            </View>
            <Text style={[styles.status, member.online ? styles.online : styles.offline]}>{overviewCached ? (member.online ? 'Online at last check' : 'Offline at last check') : (member.online ? 'Online' : 'Offline')}</Text>
          </View>
        ))}
        <Text style={styles.section}>Cashier sales · last 24 hours</Text>
        <Text style={styles.help}>Completed sales synced to the server. Offline-device receipts appear after that device reconnects.</Text>
        {overview?.sales.length ? overview.sales.map((sale) => (
          <View key={`${sale.user_id}:${sale.currency_code}`} style={styles.row}>
            <View style={styles.member}>
              <Text style={styles.name}>{sale.full_name}</Text>
              <Text style={styles.meta}>{sale.sale_count} sale{sale.sale_count === 1 ? '' : 's'}</Text>
            </View>
            <Text style={styles.amount}>{sale.currency_code} {Number(sale.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>
        )) : overview ? <Text style={styles.help}>No completed cashier sales in the last 24 hours.</Text> : null}
        <AppButton title="Review account requests" onPress={() => router.push('/users')} busy={refreshing} />
        <AppButton title="Refresh team and sales" onPress={() => { void refreshRequests(); void refreshOverview(); }} secondary disabled={refreshing} />
        <AppButton title="Role permissions" onPress={() => router.push('/roles')} secondary />
        <AppButton title="Open Sellora workspace" onPress={() => router.push('/dashboard')} secondary />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingBottom: 28 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 26 },
  help: { color: colors.muted, lineHeight: 22, marginTop: 7 },
  section: { color: colors.navy, fontSize: 19, fontWeight: '800', marginTop: 25, marginBottom: 5 },
  card: { backgroundColor: 'white', borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 18, marginTop: 22 },
  label: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  count: { color: colors.tealDark, fontSize: 36, fontWeight: '900', marginTop: 8 },
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  member: { flex: 1 },
  name: { color: colors.navy, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  status: { fontSize: 12, fontWeight: '800' },
  online: { color: colors.tealDark },
  offline: { color: colors.muted },
  amount: { color: colors.navy, fontWeight: '800' },
});

import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useConnection } from '@/providers/ConnectionProvider';
import { useOfflineSync } from '@/providers/OfflineSyncProvider';
import { listOfflineCustomers } from '@/services/customers';
import { listOfflineSales } from '@/services/offlineSales';
import { colors } from '@/theme/colors';

/** Shows queued local records and lets staff retry delivery when online. */
export default function SyncQueueScreen() {
  const { profile, session, locked } = useAuth();
  const { mode, connected } = useConnection();
  const { refresh, syncing } = useOfflineSync();
  const db = useSQLiteContext();
  const [sales, setSales] = useState<Awaited<ReturnType<typeof listOfflineSales>>>([]);
  const [customers, setCustomers] = useState<Awaited<ReturnType<typeof listOfflineCustomers>>>([]);
  const [productChanges, setProductChanges] = useState<{ id: string; action: string; status: string; last_error: string | null }[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    try {
      const [saleRows, customerRows, productRows, saved] = await Promise.all([
        listOfflineSales(session.user.id),
        listOfflineCustomers(session.user.id),
        db.getAllAsync<{ id: string; action: string; status: string; last_error: string | null }>("SELECT id,action,status,last_error FROM sync_queue WHERE user_id=? AND entity='product' ORDER BY created_at DESC LIMIT 100", session.user.id),
        db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', 'last_sync_at'),
      ]);
      setSales(saleRows);
      setCustomers(customerRows);
      setProductChanges(productRows);
      setLastSync(saved?.value ?? null);
    } catch (error) {
      Alert.alert('Could not load sync queue', error instanceof Error ? error.message : 'Please retry.');
    }
  }, [db, session?.user.id]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [load]);

  async function retry() {
    if (mode !== 'online' || !connected) {
      Alert.alert('Connect to sync', 'Switch to Online Mode and make sure the Sellora server is reachable.');
      return;
    }
    await refresh();
    await load();
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Offline & sync</Text>
        <Text style={styles.help}>Mode: {mode} · Sellora server: {connected ? 'reachable' : 'not reachable'}</Text>
        <Text style={styles.help}>Last successful sync: {lastSync ? new Date(lastSync).toLocaleString() : 'Not synced yet'}</Text>
        <AppButton title={syncing ? 'Syncing…' : 'Sync pending records'} onPress={retry} disabled={syncing} />

        <Text style={styles.section}>Offline customers</Text>
        {customers.map((row) => {
          return (
            <View key={row.id} style={styles.card}>
              <Text style={styles.name}>{row.payload.full_name}</Text>
              <Text style={[styles.status, row.status === 'failed' && styles.failed]}>{row.status.toUpperCase()}</Text>
              {row.last_error ? <Text style={styles.error}>{row.last_error}</Text> : null}
            </View>
          );
        })}
        {!customers.length ? <Text style={styles.help}>No local customer records are waiting.</Text> : null}

        <Text style={styles.section}>Product changes</Text>
        {productChanges.map((row) => (
          <View key={row.id} style={styles.card}>
            <Text style={styles.name}>{row.action === 'create' ? 'New product' : 'Product edit'}</Text>
            <Text style={[styles.status, row.status === 'failed' && styles.failed]}>{row.status.toUpperCase()}</Text>
            {row.last_error ? <Text style={styles.error}>{row.last_error}</Text> : null}
          </View>
        ))}
        {!productChanges.length ? <Text style={styles.help}>No product changes are queued.</Text> : null}

        <Text style={styles.section}>Offline sales</Text>
        {sales.map((row) => {
          const sale = row.payload;
          return (
            <View key={row.id} style={styles.card}>
              <Text style={styles.name}>Local receipt {row.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.help}>{sale.items.length} items · {sale.total.toFixed(2)} {sale.currency} · {new Date(row.created_at).toLocaleString()}</Text>
              <Text style={[styles.status, row.status === 'failed' && styles.failed]}>{row.status.toUpperCase()} · attempts {row.attempt_count}</Text>
              {row.last_error ? <Text style={styles.error}>{row.last_error}</Text> : null}
              {row.server_sale_id ? <Text style={styles.help}>Server sale: {row.server_sale_id}</Text> : null}
            </View>
          );
        })}
        {!sales.length ? <Text style={styles.help}>No offline sales are waiting to sync.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 30 },
  title: { color: colors.navy, fontSize: 27, fontWeight: '800', marginTop: 24 },
  section: { color: colors.navy, fontSize: 19, fontWeight: '800', marginTop: 24 },
  help: { color: colors.muted, marginTop: 6, lineHeight: 21 },
  card: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 15, marginTop: 12 },
  name: { color: colors.navy, fontWeight: '800' },
  status: { color: colors.tealDark, fontWeight: '800', fontSize: 12, marginTop: 9 },
  failed: { color: colors.danger },
  error: { color: colors.danger, fontSize: 12, marginTop: 6, lineHeight: 18 },
});

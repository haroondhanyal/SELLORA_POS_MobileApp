import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { listStockAdjustments } from '@/services/inventory';
import { colors } from '@/theme/colors';

/** Phase 4 immutable adjustment history for branch inventory review. */
export default function StockAdjustmentHistoryScreen() {
  const { profile, session, locked } = useAuth();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listStockAdjustments>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listStockAdjustments().then(setRows).catch((error) => Alert.alert('Could not load adjustment history', error instanceof Error ? error.message : 'Please try again.')).finally(() => setLoading(false));
  }, []);

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Stock adjustments</Text>
        <Text style={styles.help}>Each row shows who changed stock, where it happened, and why.</Text>
        {loading ? <Text style={styles.help}>Loading history…</Text> : null}
        {rows.map((row) => <View key={row.id} style={styles.card}>
          <Text style={styles.name}>{row.products?.name ?? 'Product'}{row.product_variants ? ` · ${row.product_variants.name}` : ''} · {row.quantity_delta > 0 ? '+' : ''}{Number(row.quantity_delta)}</Text>
          <Text style={styles.help}>SKU {row.product_variants?.sku ?? row.products?.sku ?? '—'} · {row.warehouses?.name ?? 'Warehouse'}</Text>
          <Text style={styles.reason}>{row.reason}</Text>
          <Text style={styles.date}>{new Date(row.created_at).toLocaleString()}</Text>
        </View>)}
        {!loading && rows.length === 0 ? <Text style={styles.empty}>No stock adjustments recorded.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 }, help: { color: colors.muted, lineHeight: 21, marginTop: 6 }, card: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginTop: 10 }, name: { color: colors.navy, fontWeight: '800' }, reason: { color: colors.text, marginTop: 8 }, date: { color: colors.muted, fontSize: 11, marginTop: 7 }, empty: { color: colors.muted, textAlign: 'center', marginTop: 30 } });

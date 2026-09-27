import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { formatCurrency, type CurrencyCode } from '@/services/currency';
import { listOfflineSales, type OfflineSalePayload } from '@/services/offlineSales';
import { colors } from '@/theme/colors';

/** Shows an encrypted on-device receipt while its sale waits for online sync. */
export default function OfflineReceiptScreen() {
  const { saleId } = useLocalSearchParams<{ saleId: string }>();
  const { profile, session, locked } = useAuth();
  const [payload, setPayload] = useState<OfflineSalePayload | null>(null);

  // Query only the current account's encrypted receipt queue.
  useEffect(() => {
    const userId = session?.user.id;
    if (!saleId || !userId) return;

    listOfflineSales(userId)
      .then((rows) => {
        const ownReceipt = rows.find((row) => row.id === saleId);
        if (ownReceipt) setPayload(ownReceipt.payload);
      })
      .catch((error) => Alert.alert(
        'Could not load local receipt',
        error instanceof Error ? error.message : 'Please try again.',
      ));
  }, [saleId, session?.user.id]);

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Offline sale saved</Text>
        {payload ? <Receipt payload={payload} /> : <Text style={styles.help}>Loading local receipt…</Text>}
        <AppButton title="View sync queue" onPress={() => router.replace('/settings/sync')} />
        <AppButton title="Return to dashboard" secondary onPress={() => router.replace('/dashboard')} />
      </View>
    </Screen>
  );
}

function Receipt({ payload }: { payload: OfflineSalePayload }) {
  const currency = (payload.currency || 'PKR') as CurrencyCode;

  return (
    <View style={styles.receipt}>
      <Text style={styles.brand}>SELLORA</Text>
      <Text style={styles.number}>LOCAL-{payload.id.slice(0, 8).toUpperCase()}</Text>
      <Text style={styles.pending}>Waiting for server synchronization</Text>
      {payload.items.map((item, index) => (
        <View key={`${item.productId}-${index}`} style={styles.row}>
          <Text style={styles.name}>{item.name} × {item.quantity}</Text>
          <Text style={styles.money}>{formatCurrency(item.price * item.quantity, currency)}</Text>
        </View>
      ))}
      <Text style={styles.total}>Total · {formatCurrency(payload.total, currency)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 30 },
  title: { color: colors.navy, fontSize: 27, fontWeight: '800', marginTop: 24 },
  receipt: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 18, marginTop: 18 },
  brand: { color: colors.tealDark, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  number: { color: colors.navy, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  pending: { color: colors.warning, fontWeight: '700', textAlign: 'center', fontSize: 12, marginTop: 5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { flex: 1, color: colors.text, fontWeight: '600' },
  money: { color: colors.navy, fontWeight: '700' },
  total: { color: colors.navy, fontWeight: '900', fontSize: 18, textAlign: 'right', marginTop: 14 },
  help: { color: colors.muted, marginTop: 10 },
});

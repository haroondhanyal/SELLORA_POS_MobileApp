import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { getSaleReceipt } from '@/services/customers';
import { formatCurrency, type CurrencyCode } from '@/services/currency';
import { colors } from '@/theme/colors';

/** Phase 5 receipt screen showing immutable sale, item and payment snapshots. */
export default function SaleReceiptScreen() {
  const { saleId } = useLocalSearchParams<{ saleId: string }>();
  const { profile, session, locked } = useAuth();
  const [receipt, setReceipt] = useState<Awaited<ReturnType<typeof getSaleReceipt>> | null>(null);

  useEffect(() => {
    if (!saleId) return;
    getSaleReceipt(saleId).then(setReceipt).catch((error) => Alert.alert('Could not load receipt', error instanceof Error ? error.message : 'Please try again.'));
  }, [saleId]);

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!saleId) return <Screen><Text style={styles.title}>Receipt id is missing.</Text></Screen>;
  const currency = (receipt?.sale.base_currency ?? 'PKR') as CurrencyCode;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Sale complete</Text>
        {receipt ? <>
          <View style={styles.receipt}>
            <Text style={styles.brand}>SELLORA</Text>
            <Text style={styles.receiptNumber}>{receipt.sale.receipt_number}</Text>
            <Text style={styles.meta}>{new Date(receipt.sale.created_at).toLocaleString()}</Text>
            <View style={styles.divider} />
            {receipt.items.map((item, index) => <View key={`${item.sku}-${index}`} style={styles.line}>
              <View style={styles.lineCopy}><Text style={styles.name}>{item.product_name}</Text><Text style={styles.meta}>{item.quantity} × {formatCurrency(Number(item.unit_price), currency)}</Text></View>
              <Text style={styles.lineTotal}>{formatCurrency(Number(item.line_total), currency)}</Text>
            </View>)}
            <View style={styles.divider} />
            <ReceiptAmount label="Subtotal" amount={receipt.sale.subtotal} currency={currency} />
            <ReceiptAmount label="Discount" amount={receipt.sale.discount_total} currency={currency} />
            <ReceiptAmount label="Tax" amount={receipt.sale.tax_total} currency={currency} />
            <ReceiptAmount label="Total" amount={receipt.sale.total} currency={currency} strong />
            <View style={styles.divider} />
            <Text style={styles.section}>Payments</Text>
            {receipt.payments.map((payment, index) => <ReceiptAmount key={`${payment.method}-${index}`} label={payment.method.replaceAll('_', ' ')} amount={payment.amount} currency={currency} />)}
            <Text style={styles.immutable}>Original currency: {currency}. Changing display currency never edits a completed sale.</Text>
          </View>
          <AppButton title="Start next sale" onPress={() => router.replace('/pos')} />
          <AppButton title="Return to dashboard" onPress={() => router.replace('/dashboard')} secondary />
        </> : <Text style={styles.meta}>Loading receipt…</Text>}
      </View>
    </Screen>
  );
}

function ReceiptAmount({ label, amount, currency, strong = false }: { label: string; amount: number; currency: CurrencyCode; strong?: boolean }) {
  return <View style={styles.amountRow}><Text style={strong ? styles.totalText : styles.meta}>{label}</Text><Text style={strong ? styles.totalText : styles.meta}>{formatCurrency(Number(amount), currency)}</Text></View>;
}

const styles = StyleSheet.create({
  page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  receipt: { backgroundColor: 'white', borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 18, marginTop: 18 },
  brand: { color: colors.tealDark, fontWeight: '900', letterSpacing: 2, fontSize: 18, textAlign: 'center' },
  receiptNumber: { color: colors.navy, textAlign: 'center', fontWeight: '800', marginTop: 8 }, meta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border, marginVertical: 14 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 7 }, lineCopy: { flex: 1 },
  name: { color: colors.text, fontWeight: '700' }, lineTotal: { color: colors.navy, fontWeight: '700' },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }, totalText: { color: colors.navy, fontWeight: '900', fontSize: 17 },
  section: { color: colors.navy, fontWeight: '800', marginBottom: 4 }, immutable: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 12 },
});

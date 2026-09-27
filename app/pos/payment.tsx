import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { OptionPicker } from '@/components/OptionPicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useConnection } from '@/providers/ConnectionProvider';
import { useCart } from '@/providers/CartProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { calculateCartTotals } from '@/services/cart';
import { completeSale, type PaymentLine } from '@/services/pos';
import { colors } from '@/theme/colors';

const paymentMethods = [
  { id: 'cash', label: 'Cash' }, { id: 'card', label: 'Card' },
  { id: 'bank_transfer', label: 'Bank transfer' }, { id: 'jazzcash', label: 'JazzCash' },
  { id: 'easypaisa', label: 'Easypaisa' }, { id: 'customer_credit', label: 'Customer credit' },
  { id: 'store_credit', label: 'Store credit' },
];
type PaymentDraft = { method: string | null; amount: string; reference: string };

/** Collects one or more payment methods and confirms the sale in a single database transaction. */
export default function PosPaymentScreen() {
  const { profile, session, locked } = useAuth();
  const { mode } = useConnection();
  const { items, customerId, salesAgentId, warehouseId, clearCart } = useCart();
  const { formatMoney, baseCurrency } = useCurrency();
  const totals = calculateCartTotals(items);
  const [payments, setPayments] = useState<PaymentDraft[]>([{ method: 'cash', amount: totals.total.toFixed(2), reference: '' }]);
  const [busy, setBusy] = useState(false);
  const paidTotal = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const remaining = Math.max(totals.total - paidTotal, 0);

  useEffect(() => {
    if (payments.length === 1 && payments[0].method === 'cash') {
      setPayments([{ ...payments[0], amount: totals.total.toFixed(2) }]);
    }
  }, [totals.total]);

  function updatePayment(index: number, key: keyof PaymentDraft, value: string | null) {
    setPayments((current) => current.map((payment, row) => row === index ? { ...payment, [key]: value } : payment));
  }

  function addPayment() {
    setPayments((current) => [...current, { method: 'cash', amount: remaining.toFixed(2), reference: '' }]);
  }

  function removePayment(index: number) {
    setPayments((current) => current.filter((_, row) => row !== index));
  }

  async function submit() {
    if (!profile?.primary_branch_id || !warehouseId || !salesAgentId || items.length === 0) {
      Alert.alert('Checkout is incomplete', 'Choose a branch, warehouse, sales agent and at least one product.');
      return;
    }
    const validPayments = payments.filter((payment) => Number(payment.amount) > 0 && payment.method) as (PaymentDraft & { method: string })[];
    const paymentSum = validPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    if (validPayments.length === 0 || Math.abs(paymentSum - totals.total) > 0.01) {
      Alert.alert('Payment does not match', `Enter split payments totalling ${formatMoney(totals.total)}.`);
      return;
    }
    if (validPayments.some((payment) => ['customer_credit', 'store_credit'].includes(payment.method)) && !customerId) {
      Alert.alert('Choose a customer', 'Customer credit and store credit need a customer account.');
      return;
    }

    setBusy(true);
    try {
      const saleId = await completeSale({
        branchId: profile.primary_branch_id,
        warehouseId,
        customerId,
        salesAgentId,
        items,
        payments: validPayments.map((payment): PaymentLine => ({ method: payment.method, amount: Number(payment.amount), reference: payment.reference.trim() })),
      });
      clearCart();
      router.replace({ pathname: '/pos/receipt', params: { saleId } });
    } catch (error) {
      Alert.alert('Sale was not completed', error instanceof Error ? error.message : 'Review stock, branch access and payment details.');
    } finally { setBusy(false); }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Payment</Text>
        {mode === 'offline' ? <Text style={styles.help}>Switch Online from the header to complete a sale. Offline sale queuing is not enabled yet.</Text> : null}
        <Text style={styles.help}>All amounts are entered in {baseCurrency}. The saved receipt keeps the business base currency.</Text>
        <View style={styles.summary}>
          <Text style={styles.totalLabel}>Amount due</Text>
          <Text style={styles.total}>{formatMoney(totals.total)}</Text>
          <Text style={styles.help}>Entered: {formatMoney(paidTotal)} · Remaining: {formatMoney(remaining)}</Text>
        </View>
        {payments.map((payment, index) => (
          <View key={index} style={styles.paymentCard}>
            <View style={styles.rowTitle}><Text style={styles.rowHeading}>Payment {index + 1}</Text>{payments.length > 1 ? <Pressable onPress={() => removePayment(index)}><Text style={styles.remove}>Remove</Text></Pressable> : null}</View>
            <OptionPicker label="Method" value={payment.method} options={paymentMethods} onChange={(value) => updatePayment(index, 'method', value)} />
            <FormField label={`Amount (${baseCurrency})`} value={payment.amount} onChangeText={(value) => updatePayment(index, 'amount', value)} keyboardType="decimal-pad" />
            <FormField label="Reference (optional)" value={payment.reference} onChangeText={(value) => updatePayment(index, 'reference', value)} />
          </View>
        ))}
        <AppButton title="Add split payment" secondary onPress={addPayment} />
        <AppButton title="Complete sale" onPress={submit} busy={busy} disabled={items.length === 0 || mode === 'offline'} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 32 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  help: { color: colors.muted, lineHeight: 21, marginTop: 6 },
  summary: { backgroundColor: '#E5F6F1', padding: 16, borderRadius: 14, marginTop: 18 },
  totalLabel: { color: colors.tealDark, fontWeight: '700' }, total: { color: colors.navy, fontWeight: '900', fontSize: 27, marginTop: 5 },
  paymentCard: { backgroundColor: 'white', borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 14 },
  rowTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, rowHeading: { color: colors.navy, fontWeight: '800', fontSize: 16 },
  remove: { color: colors.danger, fontWeight: '700' },
});

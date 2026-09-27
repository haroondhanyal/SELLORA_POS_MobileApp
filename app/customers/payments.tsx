import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { receiveCustomerCreditPayment, listCustomers, type Customer } from '@/services/customers';
import { colors } from '@/theme/colors';

/** Collects an account payment and reduces customer outstanding credit atomically. */
export default function CustomerPaymentsScreen() {
  const { profile, permissionCodes, session, locked } = useAuth(); const { formatMoney } = useCurrency();
  const [customers, setCustomers] = useState<Customer[]>([]); const [customerId, setCustomerId] = useState<string | null>(null);
  const [amount, setAmount] = useState(''); const [method, setMethod] = useState('cash'); const [reference, setReference] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (profile?.primary_branch_id) listCustomers(profile.primary_branch_id).then(setCustomers).catch((error) => Alert.alert('Could not load customers', error.message)); }, [profile?.primary_branch_id]);
  async function save() { const selected = customers.find((row) => row.id === customerId); const value = Number(amount); if (!selected || value <= 0 || value > Number(selected.credit_balance)) { Alert.alert('Check payment', 'Choose a customer and enter an amount up to their outstanding balance.'); return; } setBusy(true); try { await receiveCustomerCreditPayment({ customerId: selected.id, amount: value, method, reference }); setCustomers((rows) => rows.map((row) => row.id === selected.id ? { ...row, credit_balance: Number(row.credit_balance) - value } : row)); setAmount(''); Alert.alert('Payment recorded', 'Customer outstanding balance has been updated.'); } catch (error) { Alert.alert('Could not record payment', error instanceof Error ? error.message : 'Please try again.'); } finally { setBusy(false); } }
  if (locked) return <Redirect href="/auth/pin-login" />; if (!session) return <Redirect href="/auth/login" />; if (!permissionCodes.includes('customers.credit.manage')) return <Screen><Text>Access denied</Text></Screen>;
  const owing = customers.filter((customer) => Number(customer.credit_balance) > 0);
  return <Screen><View style={styles.page}><AppHeader profile={profile} /><Text style={styles.title}>Customer credit payments</Text><Text style={styles.help}>Select a customer with an outstanding balance.</Text>
    {owing.map((customer) => <Pressable key={customer.id} style={[styles.card, customerId===customer.id && styles.selected]} onPress={() => setCustomerId(customer.id)}><Text style={styles.name}>{customer.full_name}</Text><Text style={styles.help}>Outstanding: {formatMoney(Number(customer.credit_balance))}</Text></Pressable>)}
    {customerId ? <><FormField label="Payment amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /><FormField label="Reference (optional)" value={reference} onChangeText={setReference} /><Text style={styles.label}>Payment method</Text><View style={styles.row}>{['cash','card','bank_transfer','jazzcash','easypaisa'].map((value) => <Pressable key={value} style={[styles.method,method===value&&styles.selected]} onPress={() => setMethod(value)}><Text style={styles.name}>{value.replace('_',' ')}</Text></Pressable>)}</View><AppButton title="Receive payment" onPress={save} busy={busy} /></> : null}
    {!owing.length ? <Text style={styles.help}>No customers currently have an outstanding balance.</Text> : null}</View></Screen>;
}
const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 26, fontWeight: '800', marginTop: 24 }, help: { color: colors.muted, marginTop: 6, lineHeight: 21 }, card: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginTop: 10 }, selected: { borderColor: colors.tealDark, backgroundColor: '#DDF3EC' }, name: { color: colors.navy, fontWeight: '700', textTransform: 'capitalize' }, label: { color: colors.text, fontWeight: '700', marginTop: 18 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }, method: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 10 } });

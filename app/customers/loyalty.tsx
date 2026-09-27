import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { FormField } from '@/components/FormField';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { listCustomers, redeemCustomerLoyalty, type Customer } from '@/services/customers';
import { colors } from '@/theme/colors';

/** Redeems customer reward points into store credit using the server transaction. */
export default function CustomerLoyaltyScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const { formatMoney } = useCurrency();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [points, setPoints] = useState('100');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (profile?.primary_branch_id) listCustomers(profile.primary_branch_id).then(setCustomers).catch((error) => Alert.alert('Could not load customers', error.message));
  }, [profile?.primary_branch_id]);

  async function redeem() {
    const customer = customers.find((row) => row.id === selectedId);
    const value = Number(points);
    if (!customer || !Number.isInteger(value) || value < 100 || value % 100 !== 0 || value > customer.loyalty_points) {
      Alert.alert('Check point amount', 'Choose a customer and enter available points in multiples of 100.');
      return;
    }
    setBusy(true);
    try {
      const storeCredit = await redeemCustomerLoyalty(customer.id, value);
      setCustomers((rows) => rows.map((row) => row.id === customer.id ? {
        ...row, loyalty_points: row.loyalty_points - value, store_credit_balance: Number(row.store_credit_balance) + storeCredit,
      } : row));
      Alert.alert('Rewards redeemed', `${value} points became ${formatMoney(storeCredit)} of store credit.`);
    } catch (error) { Alert.alert('Could not redeem points', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!permissionCodes.includes('customers.manage')) return <Screen><Text>Customer management access is required.</Text></Screen>;
  const eligible = customers.filter((customer) => customer.loyalty_points >= 100);

  return (
    <Screen><View style={styles.page}>
      <AppHeader profile={profile} />
      <Text style={styles.title}>Loyalty rewards</Text>
      <Text style={styles.help}>100 points can be redeemed for 1 unit of the business base currency.</Text>
      {eligible.map((customer) => <Pressable key={customer.id} onPress={() => setSelectedId(customer.id)} style={[styles.card, selectedId === customer.id && styles.selected]}>
        <Text style={styles.name}>{customer.full_name}</Text>
        <Text style={styles.help}>{customer.loyalty_points} points · {formatMoney(Number(customer.store_credit_balance))} store credit</Text>
      </Pressable>)}
      {selectedId ? <><FormField label="Points to redeem (multiples of 100)" value={points} onChangeText={setPoints} keyboardType="number-pad" /><AppButton title="Redeem to store credit" onPress={redeem} busy={busy} /></> : null}
      {!eligible.length ? <Text style={styles.help}>No customers have enough points to redeem.</Text> : null}
    </View></Screen>
  );
}

const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 27, fontWeight: '800', marginTop: 24 }, help: { color: colors.muted, marginTop: 6, lineHeight: 21 }, card: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 15, marginTop: 11 }, selected: { borderColor: colors.tealDark, backgroundColor: '#F2FBF8' }, name: { color: colors.navy, fontWeight: '800' } });

import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { getCustomerPhotoUrl, listBranchSalesAgents, listCustomers, type Customer } from '@/services/customers';
import { colors } from '@/theme/colors';

/** Phase 5 branch customer search; the row policy limits records to assigned branches. */
export default function CustomersScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const { formatMoney } = useCurrency();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const canView = permissionCodes.includes('customers.view') || permissionCodes.includes('customers.manage');
  const canCreate = permissionCodes.includes('customers.manage');

  async function load() {
    if (!profile?.primary_branch_id) return;
    setLoading(true);
    try {
      const [rows, agents] = await Promise.all([
        listCustomers(profile.primary_branch_id),
        listBranchSalesAgents(profile.primary_branch_id),
      ]);
      setCustomers(rows);
      setAgentNames(Object.fromEntries(agents.map((agent) => [agent.id, agent.full_name])));
      const photos = await Promise.all(rows.map(async (customer) => [customer.id, await getCustomerPhotoUrl(customer.avatar_storage_path)] as const));
      setPhotoUrls(Object.fromEntries(photos.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))));
    }
    catch (error) { Alert.alert('Could not load customers', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [profile?.primary_branch_id]);

  const visibleCustomers = useMemo(() => {
    const text = query.trim().toLowerCase();
    return customers.filter((customer) => `${customer.full_name} ${customer.phone ?? ''} ${customer.email ?? ''}`.toLowerCase().includes(text));
  }, [customers, query]);

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Customers</Text>
        <Text style={styles.help}>Find customer details for this branch.</Text>
        <FormField label="Search name, phone or email" value={query} onChangeText={setQuery} />
        {canCreate ? <AppButton title="Add customer" onPress={() => router.push('/customers/add')} /> : null}
        {!profile?.primary_branch_id ? <Text style={styles.empty}>Your account needs a branch assignment before customers can be loaded.</Text> : null}
        {!canView ? <Text style={styles.empty}>Your role does not have customer access.</Text> : null}
        {loading ? <Text style={styles.help}>Loading customers…</Text> : null}
        {visibleCustomers.map((customer) => (
          <Pressable key={customer.id} style={styles.card}>
            <View style={styles.customerHeading}>
              {photoUrls[customer.id] ? <Image source={{ uri: photoUrls[customer.id] }} style={styles.avatar} /> : null}
              <View style={styles.customerInfo}>
                <Text style={styles.name}>{customer.full_name}</Text>
                {customer.phone ? <Text style={styles.help}>{customer.phone}</Text> : null}
                {customer.email ? <Text style={styles.help}>{customer.email}</Text> : null}
              </View>
            </View>
            <Text style={styles.balance}>Credit balance: {formatMoney(Number(customer.credit_balance))}</Text>
            <Text style={styles.help}>Credit limit: {formatMoney(Number(customer.credit_limit))} · Loyalty points: {customer.loyalty_points ?? 0}</Text>
            {customer.assigned_sales_agent_id && agentNames[customer.assigned_sales_agent_id] ? <Text style={styles.help}>Sales agent: {agentNames[customer.assigned_sales_agent_id]}</Text> : null}
            {customer.date_of_birth ? <Text style={styles.help}>Date of birth: {customer.date_of_birth}</Text> : null}
          </Pressable>
        ))}
        {!loading && profile?.primary_branch_id && visibleCustomers.length === 0 ? <Text style={styles.empty}>No customers found.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  help: { color: colors.muted, lineHeight: 21, marginTop: 6 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 28, lineHeight: 22 },
  card: { backgroundColor: 'white', borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 15, marginTop: 11 },
  customerHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  customerInfo: { flex: 1 },
  name: { color: colors.navy, fontWeight: '800', fontSize: 16 },
  balance: { color: colors.tealDark, marginTop: 8, fontWeight: '700' },
});

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { getFinanceOverview } from '@/services/finance';
import { colors } from '@/theme/colors';

const periods = [1, 7, 30, 90] as const;
type FinanceData = Awaited<ReturnType<typeof getFinanceOverview>>;

/** Permission-scoped financial overview for a single assigned branch. */
export default function FinanceScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const userId = session?.user.id;
  const { formatMoney } = useCurrency();
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const salesAccess = permissionCodes.includes('reports.view');
  const expenseAccess = permissionCodes.includes('expenses.view') || permissionCodes.includes('expenses.manage');
  const canOpen = salesAccess || expenseAccess;

  const load = useCallback(async () => {
    if (!profile?.primary_branch_id || !userId || !canOpen) return;
    setLoading(true);
    try {
      const start = new Date(Date.now() - days * 86400000).toISOString();
      setData(await getFinanceOverview(profile.primary_branch_id, start, { sales: salesAccess, expenses: expenseAccess, userId }));
    } catch (error) {
      Alert.alert('Could not load finance overview', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [profile?.primary_branch_id, userId, canOpen, days, salesAccess, expenseAccess]);

  useEffect(() => { void load(); }, [load]);
  const expensesByCategory = useMemo(() => {
    const groups = new Map<string, number>();
    for (const row of data?.expenses ?? []) groups.set(row.category, (groups.get(row.category) ?? 0) + Number(row.amount));
    return [...groups.entries()].sort((a, b) => b[1] - a[1]);
  }, [data?.expenses]);

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!canOpen) return <Screen><Text>Finance access is required.</Text></Screen>;
  if (!profile?.primary_branch_id) return <Screen><Text>Assign this account to a branch to view finance data.</Text></Screen>;

  return <Screen><View style={styles.page}>
    <AppHeader profile={profile} />
    <Text style={styles.title}>Finance</Text>
    <Text style={styles.help}>Branch activity for the selected period. Figures follow the records your role can access.</Text>
    <View style={styles.periods}>{periods.map((value) => <Pressable accessibilityRole="button" accessibilityState={{ selected: days === value }} key={value} onPress={() => setDays(value)} style={[styles.period, days === value && styles.selected]}><Text style={styles.periodText}>{value === 1 ? 'Today' : `${value} days`}</Text></Pressable>)}</View>
    {loading ? <Text style={styles.help}>Updating finance overview…</Text> : null}
    {data?.cachedOffline ? <Text style={styles.offline}>Offline snapshot · figures are from the last successful refresh.</Text> : null}
    {salesAccess ? <>
      <View style={styles.metrics}>
        <Metric label="Completed sales" value={String(data?.salesCount ?? 0)} />
        <Metric label="Sales total" value={formatMoney(data?.salesTotal ?? 0)} />
      </View>
      <View style={styles.metrics}>
        <Metric label="Gross margin¹" value={formatMoney(data?.grossMargin ?? 0)} />
        <Metric label="Refunds issued" value={formatMoney(data?.refundsTotal ?? 0)} />
      </View>
      <Metric label="Commissions recorded" value={formatMoney(data?.commissionsTotal ?? 0)} />
    </> : null}
    {expenseAccess ? <>
      <Metric label="Recorded expenses" value={formatMoney(data?.expenseTotal ?? 0)} />
      <Text style={styles.section}>Expenses by category</Text>
      {expensesByCategory.map(([category, amount]) => <View key={category} style={styles.row}><Text style={styles.name}>{category}</Text><Text style={styles.amount}>{formatMoney(amount)}</Text></View>)}
      {!loading && expensesByCategory.length === 0 ? <Text style={styles.help}>No expenses recorded in this period.</Text> : null}
    </> : null}
    <Text style={styles.footnote}>¹ Gross margin uses completed sale line totals less tax and recorded item cost. It excludes overhead, commissions, refunds and tax remittance; it is not net profit.</Text>
    <AppButton title="Refresh finance data" secondary onPress={() => void load()} busy={loading} />
  </View></Screen>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  page: { paddingBottom: 32 }, title: { color: colors.navy, fontSize: 27, fontWeight: '800', marginTop: 24 },
  help: { color: colors.muted, marginTop: 7, lineHeight: 21 },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 16 },
  period: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  selected: { backgroundColor: '#DDF3EC', borderColor: colors.tealDark }, periodText: { color: colors.navy, fontWeight: '700' },
  metrics: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, backgroundColor: 'white', borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 15, marginBottom: 10 },
  label: { color: colors.muted, fontSize: 12 }, value: { color: colors.navy, fontSize: 18, fontWeight: '800', marginTop: 6 },
  section: { color: colors.navy, fontSize: 19, fontWeight: '800', marginTop: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { color: colors.navy, fontWeight: '700', textTransform: 'capitalize', flex: 1 }, amount: { color: colors.tealDark, fontWeight: '800' },
  footnote: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 18, marginBottom: 18 },
  offline: { color: colors.warning, marginBottom: 10, fontWeight: '700' },
});

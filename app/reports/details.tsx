import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { getDetailedReport } from '@/services/oversight';
import { colors } from '@/theme/colors';

type ReportRows = Awaited<ReturnType<typeof getDetailedReport>>;

/** Shows profit, category, customer, cashier and expense detail for a real period. */
export default function DetailedReportsScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const { formatMoney } = useCurrency();
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<ReportRows | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile?.primary_branch_id || !permissionCodes.includes('reports.view')) return;
    setLoading(true);
    getDetailedReport(profile.primary_branch_id, new Date(Date.now() - days * 86400000).toISOString())
      .then(setReport)
      .catch((error) => Alert.alert('Could not load detailed reports', error instanceof Error ? error.message : 'Please try again.'))
      .finally(() => setLoading(false));
  }, [profile?.primary_branch_id, permissionCodes, days]);

  const completedSales = report?.sales.filter((sale) => sale.status === 'completed') ?? [];
  const completedItems = report?.items.filter((item) => relation(item.sales)?.status === 'completed') ?? [];
  const revenue = completedSales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const profit = completedItems.reduce((sum, item) => sum + Number(item.line_total) - Number(item.tax_amount) - Number(item.unit_cost) * Number(item.quantity), 0);
  const discount = completedSales.reduce((sum, sale) => sum + Number(sale.discount_total), 0);
  const expenses = report?.expenses.reduce((sum, expense) => sum + Number(expense.amount), 0) ?? 0;
  const refunds = report?.returns.reduce((sum, row) => sum + Number(row.refund_total), 0) ?? 0;
  const commissions = report?.commissions.reduce((sum, row) => sum + Number(row.commission_amount), 0) ?? 0;
  const products = useMemo(() => summarize(completedItems, (item) => item.product_name), [completedItems]);
  const categories = useMemo(() => summarize(completedItems, (item) => relation(relation(item.products)?.categories)?.name ?? 'Uncategorized'), [completedItems]);
  const agents = useMemo(() => summarize(completedSales, (sale) => relation(sale.profiles)?.full_name ?? 'Unknown agent', (sale) => sale.total), [completedSales]);
  const cashiers = useMemo(() => summarize(completedSales, (sale) => relation(sale.cashier)?.full_name ?? 'Unknown cashier', (sale) => sale.total), [completedSales]);
  const customers = useMemo(() => summarize(completedSales.filter((sale) => sale.customer_id), (sale) => relation(sale.customers)?.full_name ?? 'Customer', (sale) => sale.total), [completedSales]);

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!permissionCodes.includes('reports.view')) return <Screen><Text>Reports access is required.</Text></Screen>;

  return <Screen><View style={styles.page}>
    <AppHeader profile={profile} />
    <Text style={styles.title}>Detailed reports</Text>
    <View style={styles.periods}>{[1, 7, 30].map((value) => <Pressable key={value} style={[styles.period, days === value && styles.selected]} onPress={() => setDays(value)}><Text style={styles.periodText}>{value === 1 ? 'Today' : `${value} days`}</Text></Pressable>)}</View>
    {loading ? <Text style={styles.help}>Loading report…</Text> : null}
    <View style={styles.metrics}>
      <Metric label="Sales" value={String(completedSales.length)} />
      <Metric label="Revenue" value={formatMoney(revenue)} />
    </View>
    <View style={styles.metrics}>
      <Metric label="Gross profit¹" value={formatMoney(profit)} />
      <Metric label="Discounts" value={formatMoney(discount)} />
    </View>
    <View style={styles.metrics}>
      <Metric label="Expenses" value={formatMoney(expenses)} />
      <Metric label="Refunds" value={formatMoney(refunds)} />
    </View>
    <Metric label="Commissions" value={formatMoney(commissions)} />
    <Text style={styles.footnote}>¹ Sales line margin before branch expenses, commissions and tax remittance.</Text>
    <Breakdown title="Products by units" rows={products} formatMoney={formatMoney} />
    <Breakdown title="Category sales" rows={categories} formatMoney={formatMoney} />
    <Breakdown title="Sales by agent" rows={agents} formatMoney={formatMoney} />
    <Breakdown title="Sales by cashier" rows={cashiers} formatMoney={formatMoney} />
    <Breakdown title="Sales by customer" rows={customers} formatMoney={formatMoney} />
    <Breakdown title="Expenses by category" rows={summarize(report?.expenses ?? [], (row) => row.category, (row) => row.amount)} formatMoney={formatMoney} />
    {!loading && !report?.sales.length ? <Text style={styles.help}>No sales are recorded in this period.</Text> : null}
  </View></Screen>;
}

function summarize<T extends { quantity?: number; line_total?: number; total?: number; amount?: number }>(rows: T[], nameFor: (row: T) => string, amountFor: (row: T) => number = (row) => Number(row.line_total ?? 0)) {
  const grouped = new Map<string, { count: number; amount: number }>();
  for (const row of rows) {
    const name = nameFor(row);
    const total = grouped.get(name) ?? { count: 0, amount: 0 };
    total.count += Number(row.quantity ?? 1);
    total.amount += Number(amountFor(row));
    grouped.set(name, total);
  }
  return [...grouped.entries()].map(([name, value]) => ({ name, ...value })).sort((left, right) => right.amount - left.amount).slice(0, 10);
}

// Supabase relation fields may be typed as either an object or a one-item array.
function relation<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

function Breakdown({ title, rows, formatMoney }: { title: string; rows: { name: string; count: number; amount: number }[]; formatMoney: (amount: number) => string }) {
  return <View><Text style={styles.section}>{title}</Text>{rows.slice(0, 10).map((row) => <View key={row.name} style={styles.row}><Text style={styles.name}>{row.name} · {row.count}</Text><Text style={styles.amount}>{formatMoney(row.amount)}</Text></View>)}{rows.length === 0 ? <Text style={styles.help}>No records in this period.</Text> : null}</View>;
}

const styles = StyleSheet.create({
  page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 27, fontWeight: '800', marginTop: 24 },
  periods: { flexDirection: 'row', gap: 8, marginVertical: 16 }, period: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  selected: { backgroundColor: '#DDF3EC', borderColor: colors.tealDark }, periodText: { color: colors.navy, fontWeight: '700' },
  metrics: { flexDirection: 'row', gap: 10, marginBottom: 10 }, metric: { flex: 1, backgroundColor: 'white', borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  label: { color: colors.muted, fontSize: 12 }, value: { color: colors.navy, fontSize: 17, fontWeight: '800', marginTop: 6 },
  section: { color: colors.navy, fontSize: 19, fontWeight: '800', marginTop: 23 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { color: colors.navy, fontWeight: '700', flex: 1 }, amount: { color: colors.tealDark, fontWeight: '800' }, help: { color: colors.muted, marginTop: 8 }, footnote: { color: colors.muted, fontSize: 11, marginBottom: 10 },
});

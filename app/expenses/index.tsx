import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { listExpenses } from '@/services/operations';
import { colors } from '@/theme/colors';

/** Shows expense history limited by branch policy and the user's permission. */
export default function ExpensesScreen() {
  const { profile, permissionCodes, session, locked } = useAuth(); const { formatMoney } = useCurrency(); const [rows, setRows] = useState<any[]>([]);
  const canView = permissionCodes.includes('expenses.view') || permissionCodes.includes('expenses.manage');
  useEffect(() => { if (!profile?.primary_branch_id || !canView) return; listExpenses(profile.primary_branch_id).then(setRows).catch((error) => Alert.alert('Could not load expenses', error.message)); }, [profile?.primary_branch_id, canView]);
  if (locked) return <Redirect href="/auth/pin-login" />; if (!session) return <Redirect href="/auth/login" />;
  return <Screen><View style={styles.page}><AppHeader profile={profile} /><Text style={styles.title}>Expenses</Text><Text style={styles.help}>Branch operating costs recorded by your team.</Text>{permissionCodes.includes('expenses.manage') ? <AppButton title="Record expense" onPress={() => router.push('/expenses/add')} /> : null}
    {canView ? rows.map((row) => <View key={row.id} style={styles.card}><Text style={styles.name}>{row.category} · {row.payment_method}</Text><Text style={styles.help}>{row.description}</Text><Text style={styles.amount}>{formatMoney(Number(row.amount))}</Text></View>) : <Text style={styles.help}>Your role cannot view expenses.</Text>}
    {canView && !rows.length ? <Text style={styles.help}>No expenses recorded for this branch.</Text> : null}</View></Screen>;
}
const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 27, fontWeight: '800', marginTop: 24 }, help: { color: colors.muted, marginTop: 7, lineHeight: 21 }, card: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 15, marginTop: 12 }, name: { color: colors.navy, fontWeight: '800', textTransform: 'capitalize' }, amount: { color: colors.tealDark, fontWeight: '800', marginTop: 6 } });

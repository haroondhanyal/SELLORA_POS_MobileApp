import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { listSalesReturns } from '@/services/operations';
import { colors } from '@/theme/colors';

/** Phase 8 return history and entry point for processing eligible refunds. */
export default function ReturnsScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const { formatMoney } = useCurrency();
  const [rows, setRows] = useState<any[]>([]);
  const canReturn = permissionCodes.includes('returns.manage');
  useEffect(() => {
    if (!profile?.primary_branch_id) return;
    listSalesReturns(profile.primary_branch_id).then(setRows).catch((error) => Alert.alert('Could not load returns', error.message));
  }, [profile?.primary_branch_id]);
  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  return <Screen><View style={styles.page}><AppHeader profile={profile} /><Text style={styles.title}>Returns & refunds</Text>
    <Text style={styles.help}>Search a receipt to return eligible items and restore stock.</Text>
    {canReturn ? <AppButton title="Process a return" onPress={() => router.push('/returns/process')} /> : null}
    {rows.map((row) => <View key={row.id} style={styles.card}><Text style={styles.name}>{row.return_number}</Text><Text style={styles.help}>Receipt: {row.sales?.receipt_number ?? 'Sale'} · {row.refund_method}</Text><Text style={styles.amount}>{formatMoney(Number(row.refund_total))}</Text><Text style={styles.help}>{row.reason}</Text></View>)}
    {!rows.length ? <Text style={styles.help}>No refunds recorded for this branch yet.</Text> : null}
  </View></Screen>;
}
const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 27, fontWeight: '800', marginTop: 24 }, help: { color: colors.muted, marginTop: 7, lineHeight: 21 }, card: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 15, marginTop: 12 }, name: { color: colors.navy, fontWeight: '800' }, amount: { color: colors.tealDark, fontWeight: '800', marginTop: 7 } });

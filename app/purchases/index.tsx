import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { listPurchaseOrders, type PurchaseOrder } from '@/services/operations';
import { colors } from '@/theme/colors';

/** Phase 7 purchase-order list with delivery-to-GRN actions. */
export default function PurchasesScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const { formatMoney } = useCurrency();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const canManage = permissionCodes.includes('inventory.manage');

  async function load() {
    if (!profile?.primary_branch_id) return;
    setLoading(true);
    try { setOrders(await listPurchaseOrders(profile.primary_branch_id)); }
    catch (error) { Alert.alert('Could not load purchases', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [profile?.primary_branch_id]);

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Purchases</Text>
        <Text style={styles.help}>Create supplier orders and record each delivery as a goods-received note.</Text>
        {canManage ? <AppButton title="New purchase order" onPress={() => router.push('/purchases/add')} /> : null}
        {loading ? <Text style={styles.help}>Loading purchase orders…</Text> : null}
        {orders.map((order) => <View key={order.id} style={styles.card}>
          <Text style={styles.name}>{order.order_number}</Text>
          <Text style={styles.help}>Status: {order.status.replaceAll('_', ' ')}</Text>
          <Text style={styles.total}>{formatMoney(Number(order.total_cost))}</Text>
          <Text style={styles.help}>Created {new Date(order.created_at).toLocaleDateString()}</Text>
          {canManage && ['ordered', 'partially_received'].includes(order.status) ? <Pressable onPress={() => router.push({ pathname: '/purchases/receive', params: { orderId: order.id } })} style={styles.receive}><Text style={styles.receiveText}>Record delivery · Create GRN</Text></Pressable> : null}
        </View>)}
        {profile?.primary_branch_id && !loading && orders.length === 0 ? <Text style={styles.empty}>No purchase orders in this branch.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 }, help: { color: colors.muted, lineHeight: 21, marginTop: 6 }, card: { borderWidth: 1, borderColor: colors.border, backgroundColor: 'white', borderRadius: 14, padding: 15, marginTop: 12 }, name: { color: colors.navy, fontWeight: '800', fontSize: 16 }, total: { color: colors.tealDark, fontWeight: '900', fontSize: 17, marginTop: 8 }, receive: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 12 }, receiveText: { color: colors.tealDark, fontWeight: '800' }, empty: { color: colors.muted, textAlign: 'center', marginTop: 28 } });

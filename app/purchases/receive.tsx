import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { getPurchaseOrderItems, receivePurchase, type PurchaseOrderItem } from '@/services/operations';
import { colors } from '@/theme/colors';

/** Phase 7 GRN form for accepting all or part of an ordered delivery into stock. */
export default function ReceivePurchaseScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { profile, permissionCodes, session, locked } = useAuth();
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const canManage = permissionCodes.includes('inventory.manage');

  useEffect(() => {
    if (!orderId) return;
    getPurchaseOrderItems(orderId).then((rows) => {
      setItems(rows);
      setQuantities(Object.fromEntries(rows.map((item) => [item.id, String(Number(item.ordered_quantity) - Number(item.received_quantity))])));
    }).catch((error) => Alert.alert('Could not load purchase items', error instanceof Error ? error.message : 'Please try again.'));
  }, [orderId]);

  function setReceivedQuantity(item: PurchaseOrderItem, value: string) {
    const amount = Number(value);
    const remaining = Number(item.ordered_quantity) - Number(item.received_quantity);
    if (value !== '' && (!Number.isFinite(amount) || amount < 0 || amount > remaining)) {
      Alert.alert('Quantity exceeds remaining amount', `Enter zero to ${remaining}.`);
      return;
    }
    setQuantities((current) => ({ ...current, [item.id]: value }));
  }

  async function save() {
    if (!orderId) return;
    const received = items.map((item) => ({ item_id: item.id, quantity: Number(quantities[item.id]) || 0 })).filter((item) => item.quantity > 0);
    if (received.length === 0) { Alert.alert('Nothing to receive', 'Enter a quantity for at least one purchase item.'); return; }
    setBusy(true);
    try {
      const noteId = await receivePurchase(orderId, received, note);
      Alert.alert('Delivery recorded', `Goods-received note ${noteId.slice(0, 8)} was created and stock was updated.`, [{ text: 'View purchases', onPress: () => router.replace('/purchases') }]);
    } catch (error) { Alert.alert('Could not receive delivery', error instanceof Error ? error.message : 'Check remaining order quantities and try again.'); }
    finally { setBusy(false); }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!canManage) return <Screen><Text style={styles.title}>Access denied</Text></Screen>;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Receive delivery</Text>
        <Text style={styles.help}>Enter the amount actually delivered. Partial deliveries leave the remaining order open.</Text>
        {items.map((item) => {
          const remaining = Number(item.ordered_quantity) - Number(item.received_quantity);
          return <View key={item.id} style={styles.card}>
            <Text style={styles.name}>{item.products?.name ?? 'Product'}</Text>
            <Text style={styles.help}>SKU {item.products?.sku ?? '—'} · {Number(item.received_quantity)} of {Number(item.ordered_quantity)} received</Text>
            <FormField label={`Received now (max ${remaining})`} value={quantities[item.id] ?? ''} onChangeText={(value) => setReceivedQuantity(item, value)} keyboardType="decimal-pad" />
          </View>;
        })}
        {items.length === 0 ? <Text style={styles.empty}>Loading order items…</Text> : null}
        <FormField label="Delivery note (optional)" value={note} onChangeText={setNote} multiline />
        <AppButton title="Create GRN and add stock" onPress={save} busy={busy} disabled={items.length === 0} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 }, help: { color: colors.muted, lineHeight: 21, marginTop: 6 }, card: { borderWidth: 1, borderColor: colors.border, backgroundColor: 'white', borderRadius: 13, padding: 14, marginTop: 12 }, name: { color: colors.navy, fontWeight: '800' }, empty: { color: colors.muted, textAlign: 'center', padding: 24 } });

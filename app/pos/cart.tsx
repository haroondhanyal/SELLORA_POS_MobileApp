import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { OptionPicker } from '@/components/OptionPicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { useConnection } from '@/providers/ConnectionProvider';
import { cartKey, useCart } from '@/providers/CartProvider';
import { listBranchSalesAgents, listCachedBranchSalesAgents, listCachedCustomers, listCustomers } from '@/services/customers';
import { getProductImageUrl } from '@/services/catalog';
import { calculateCartTotals } from '@/services/cart';
import { colors } from '@/theme/colors';

/** Phase 5 editable cart and checkout ownership selection. */
export default function PosCartScreen() {
  const params = useLocalSearchParams<{ customerId?: string }>();
  const { profile, session, locked } = useAuth();
  const { formatMoney, baseCurrency } = useCurrency();
  const { mode } = useConnection();
  const { items, customerId, salesAgentId, warehouseId, setQuantity, setDiscount, setCustomer, setSalesAgent, removeItem } = useCart();
  const [customers, setCustomers] = useState<{ id: string; label: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; label: string }[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [discountDrafts, setDiscountDrafts] = useState<Record<string, string>>({});
  const totals = calculateCartTotals(items);

  useEffect(() => {
    if (!params.customerId) return;
    setCustomer(params.customerId);
    if (mode === 'offline' && profile?.primary_branch_id) {
      listCachedCustomers(profile.primary_branch_id).then((rows) => {
        setCustomers(rows.map((customer) => ({ id: customer.id, label: customer.phone ? `${customer.full_name} · ${customer.phone}` : customer.full_name })));
      }).catch(() => {});
    }
  }, [params.customerId, mode, profile?.primary_branch_id]);

  useEffect(() => {
    if (!profile?.primary_branch_id) return;
    const customerRequest = mode === 'offline' ? listCachedCustomers(profile.primary_branch_id) : listCustomers(profile.primary_branch_id);
    const agentRequest = mode === 'offline' ? listCachedBranchSalesAgents(profile.primary_branch_id) : listBranchSalesAgents(profile.primary_branch_id);
    Promise.all([customerRequest, agentRequest]).then(([customerRows, agentRows]) => {
      setCustomers(customerRows.map((customer) => ({ id: customer.id, label: customer.phone ? `${customer.full_name} · ${customer.phone}` : customer.full_name })));
      setAgents(agentRows.map((agent) => ({ id: agent.id, label: agent.full_name })));
      if (profile.role === 'sales_agent' && agentRows.some((agent) => agent.id === profile.id)) setSalesAgent(profile.id);
      else if (!salesAgentId && agentRows.length === 1) setSalesAgent(agentRows[0].id);
    }).catch((error) => Alert.alert('Could not load checkout options', error instanceof Error ? error.message : 'Please try again.'));
  }, [profile?.id, profile?.primary_branch_id, mode]);

  useEffect(() => {
    let active = true;
    (mode === 'offline' ? Promise.resolve([]) : Promise.all(items.map(async (item) => [item.productId, await getProductImageUrl(item.imagePath)] as const))).then((images) => {
      if (active) setPhotoUrls(Object.fromEntries(images.filter(([, uri]) => Boolean(uri))) as Record<string, string>);
    }).catch(() => {});
    return () => { active = false; };
  }, [items, mode]);

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Cart</Text>
        <Text style={styles.help}>Review quantities, discounts, customer and sales ownership.</Text>
        {items.map((item) => {
          const key = cartKey(item);
          const lineSubtotal = item.price * item.quantity;
          return (
            <View key={key} style={styles.card}>
              {photoUrls[item.productId] ? <Image source={{ uri: photoUrls[item.productId] }} style={styles.image} /> : <View style={styles.imagePlaceholder}><Text style={styles.initial}>S</Text></View>}
              <View style={styles.details}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>SKU {item.sku} · {formatMoney(item.price)}</Text>
                <View style={styles.quantityRow}>
                  <Pressable onPress={() => setQuantity(key, item.quantity - 1)} style={styles.qtyButton}><Text style={styles.qtyText}>−</Text></Pressable>
                  <Text style={styles.quantity}>{item.quantity}</Text>
                  <Pressable onPress={() => {
                    if (item.quantity >= item.quantityAvailable) Alert.alert('Not enough stock', `${item.quantityAvailable} available in this warehouse.`);
                    else setQuantity(key, item.quantity + 1);
                  }} style={styles.qtyButton}><Text style={styles.qtyText}>+</Text></Pressable>
                  <Pressable onPress={() => removeItem(key)}><Text style={styles.remove}>Remove</Text></Pressable>
                </View>
                <FormField
                  label={`Line discount in ${baseCurrency} (max ${lineSubtotal.toFixed(2)})`}
                  value={discountDrafts[key] ?? String(item.discountAmount)}
                  onChangeText={(text) => {
                    setDiscountDrafts((current) => ({ ...current, [key]: text }));
                    const amount = Number(text);
                    if (text === '') setDiscount(key, 0);
                    else if (Number.isFinite(amount) && amount >= 0 && amount <= lineSubtotal) setDiscount(key, amount);
                  }}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          );
        })}
        {items.length === 0 ? <Text style={styles.empty}>Your cart is empty. Add products from the POS screen.</Text> : null}
        <AppButton title="Add another product" onPress={() => router.back()} secondary />
        {profile?.primary_branch_id ? <>
          <OptionPicker label="Customer (optional)" value={customerId} options={customers} onChange={setCustomer} allowNone />
          <AppButton title="Add a new customer" onPress={() => router.push({ pathname: '/customers/add', params: { returnTo: 'pos-cart' } })} secondary />
          <OptionPicker label="Sales agent" value={salesAgentId} options={agents} onChange={setSalesAgent} />
        </> : <Text style={styles.empty}>An administrator must assign a branch before checkout.</Text>}
        <TotalsRow label="Subtotal" amount={totals.subtotal} formatMoney={formatMoney} />
        <TotalsRow label="Discount" amount={totals.discount} formatMoney={formatMoney} />
        <TotalsRow label="Tax" amount={totals.tax} formatMoney={formatMoney} />
        <TotalsRow label="Total" amount={totals.total} formatMoney={formatMoney} strong />
        <AppButton title="Continue to payment" onPress={() => {
          const invalidDiscount = items.some((item) => {
            const draft = discountDrafts[cartKey(item)];
            return draft !== undefined && (draft !== '' && (!Number.isFinite(Number(draft)) || Number(draft) < 0 || Number(draft) > item.price * item.quantity));
          });
          if (invalidDiscount) { Alert.alert('Check line discount', 'A discount cannot exceed its item subtotal.'); return; }
          router.push('/pos/payment');
        }} disabled={items.length === 0 || !warehouseId || !salesAgentId} />
      </View>
    </Screen>
  );
}

function TotalsRow({ label, amount, formatMoney, strong = false }: { label: string; amount: number; formatMoney: (value: number) => string; strong?: boolean }) {
  return <View style={styles.totalRow}><Text style={strong ? styles.totalStrong : styles.totalLabel}>{label}</Text><Text style={strong ? styles.totalStrong : styles.totalLabel}>{formatMoney(amount)}</Text></View>;
}

const styles = StyleSheet.create({
  page: { paddingBottom: 32 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  help: { color: colors.muted, lineHeight: 21, marginTop: 6 }, empty: { color: colors.muted, textAlign: 'center', lineHeight: 22, marginTop: 28 },
  card: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: 14, borderColor: colors.border, borderWidth: 1, backgroundColor: 'white', padding: 12, marginTop: 12 },
  image: { width: 54, height: 54, borderRadius: 10 }, imagePlaceholder: { width: 54, height: 54, borderRadius: 10, backgroundColor: '#E5F6F1', alignItems: 'center', justifyContent: 'center' }, initial: { color: colors.tealDark, fontWeight: '900' },
  details: { flex: 1 }, name: { color: colors.navy, fontWeight: '800' }, meta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 8 }, qtyButton: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }, qtyText: { color: colors.navy, fontWeight: '900', fontSize: 18 }, quantity: { color: colors.text, fontWeight: '800' }, remove: { color: colors.danger, fontWeight: '700', marginLeft: 'auto' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10 }, totalLabel: { color: colors.muted }, totalStrong: { color: colors.navy, fontSize: 18, fontWeight: '900' },
});

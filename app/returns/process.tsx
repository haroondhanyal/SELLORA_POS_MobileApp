import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { getReturnableSale, processSaleReturn, type ReturnableSaleItem } from '@/services/operations';
import { colors } from '@/theme/colors';

/** Cashier selects a receipt, return quantities, reason, and refund method. */
export default function ProcessReturnScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const [receipt, setReceipt] = useState('');
  const [saleId, setSaleId] = useState('');
  const [items, setItems] = useState<ReturnableSaleItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  async function findSale() { try { const result = await getReturnableSale(receipt); if (result.sale.status !== 'completed') throw new Error('This receipt is not eligible for a return.'); setSaleId(result.sale.id); setItems(result.items); } catch (error) { Alert.alert('Receipt not found', error instanceof Error ? error.message : 'Check the receipt number.'); } }
  async function save() {
    const selected = items.flatMap((item) => { const qty = Number(quantities[item.id] ?? 0); return qty > 0 ? [{ sale_item_id: item.id, quantity: qty }] : []; });
    if (!saleId || !selected.length || reason.trim().length < 3) { Alert.alert('Complete return details', 'Find a receipt, enter a return quantity and add a reason.'); return; }
    setBusy(true); try { await processSaleReturn({ saleId, items: selected, reason, refundMethod: method }); Alert.alert('Return processed', 'Refund recorded and stock restored.', [{ text: 'Done', onPress: () => router.replace('/returns') }]); }
    catch (error) { Alert.alert('Could not process return', error instanceof Error ? error.message : 'Please try again.'); } finally { setBusy(false); }
  }
  if (locked) return <Redirect href="/auth/pin-login" />; if (!session) return <Redirect href="/auth/login" />;
  if (!permissionCodes.includes('returns.manage')) return <Screen><Text>Access denied</Text></Screen>;
  return <Screen><View style={styles.page}><AppHeader profile={profile} /><Text style={styles.title}>Process return</Text><FormField label="Receipt number" value={receipt} onChangeText={setReceipt} autoCapitalize="characters" /><AppButton title="Find receipt" secondary onPress={findSale} />
    {items.map((item) => <View key={item.id} style={styles.item}><View style={styles.itemText}><Text style={styles.name}>{item.product_name}</Text><Text style={styles.help}>Sold {item.quantity} · Returned {item.returned_quantity}</Text></View><FormField label="Return qty" value={quantities[item.id] ?? ''} onChangeText={(value) => setQuantities((current) => ({ ...current, [item.id]: value }))} keyboardType="decimal-pad" /></View>)}
    {items.length ? <><FormField label="Return reason" value={reason} onChangeText={setReason} multiline /><Text style={styles.label}>Refund method</Text><View style={styles.methods}>{['cash','card','bank_transfer','jazzcash','easypaisa','store_credit'].map((option) => <Pressable key={option} onPress={() => setMethod(option)} style={[styles.method, method === option && styles.selected]}><Text style={styles.methodText}>{option.replace('_',' ')}</Text></Pressable>)}</View><AppButton title="Confirm return & refund" onPress={save} busy={busy} /></> : null}
  </View></Screen>;
}
const styles = StyleSheet.create({ page: { paddingBottom: 35 }, title: { color: colors.navy, fontSize: 27, fontWeight: '800', marginTop: 24 }, item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }, itemText: { flex: 1 }, name: { color: colors.navy, fontWeight: '700' }, help: { color: colors.muted, marginTop: 4 }, label: { marginTop: 18, color: colors.text, fontWeight: '700' }, methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }, method: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9 }, selected: { backgroundColor: '#DDF3EC', borderColor: colors.tealDark }, methodText: { color: colors.navy, textTransform: 'capitalize' } });

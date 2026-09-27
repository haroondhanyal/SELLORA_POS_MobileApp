import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { OptionPicker } from '@/components/OptionPicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import type { SellableProduct } from '@/providers/CartProvider';
import { listBranches, listWarehousesForBranch, type Branch, type Warehouse } from '@/services/branches';
import { listSellableItems } from '@/services/catalog';
import { createStockTransfer } from '@/services/operations';
import { colors } from '@/theme/colors';

type TransferLine = { productKey: string | null; quantity: string };
const keyFor = (item: SellableProduct) => `${item.productId}:${item.variantId ?? 'base'}`;

/** Phase 7 transfer request with source stock checks and multiple product lines. */
export default function AddStockTransferScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [fromBranchId, setFromBranchId] = useState<string | null>(profile?.primary_branch_id ?? null);
  const [toBranchId, setToBranchId] = useState<string | null>(null);
  const [fromWarehouses, setFromWarehouses] = useState<Warehouse[]>([]);
  const [toWarehouses, setToWarehouses] = useState<Warehouse[]>([]);
  const [fromWarehouseId, setFromWarehouseId] = useState<string | null>(null);
  const [toWarehouseId, setToWarehouseId] = useState<string | null>(null);
  const [products, setProducts] = useState<SellableProduct[]>([]);
  const [lines, setLines] = useState<TransferLine[]>([{ productKey: null, quantity: '1' }]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const canManage = permissionCodes.includes('inventory.manage');

  useEffect(() => {
    listBranches().then((available) => {
      setBranches(available);
      setFromBranchId((current) => current ?? profile?.primary_branch_id ?? available[0]?.id ?? null);
    }).catch((error) => Alert.alert('Could not load branches', error instanceof Error ? error.message : 'Please try again.'));
  }, []);
  useEffect(() => {
    if (!fromBranchId) return;
    listWarehousesForBranch(fromBranchId).then((locations) => {
      setFromWarehouses(locations);
      setFromWarehouseId(locations.find((location) => location.is_primary)?.id ?? locations[0]?.id ?? null);
    }).catch((error) => Alert.alert('Could not load sending warehouses', error instanceof Error ? error.message : 'Please try again.'));
  }, [fromBranchId]);
  useEffect(() => {
    if (!toBranchId) { setToWarehouses([]); setToWarehouseId(null); return; }
    listWarehousesForBranch(toBranchId).then((locations) => {
      setToWarehouses(locations);
      setToWarehouseId(locations.find((location) => location.is_primary)?.id ?? locations[0]?.id ?? null);
    }).catch((error) => Alert.alert('Could not load receiving warehouses', error instanceof Error ? error.message : 'Please try again.'));
  }, [toBranchId]);
  useEffect(() => {
    if (!fromWarehouseId) { setProducts([]); return; }
    listSellableItems(fromWarehouseId).then(setProducts).catch((error) => Alert.alert('Could not load source stock', error instanceof Error ? error.message : 'Please try again.'));
  }, [fromWarehouseId]);

  function updateLine(index: number, key: keyof TransferLine, value: string | null) {
    setLines((current) => current.map((line, row) => row === index ? { ...line, [key]: value } : line));
  }

  async function save() {
    const resolved = lines.map((line) => ({ line, product: products.find((item) => keyFor(item) === line.productKey) }));
    if (!fromWarehouseId || !toWarehouseId || fromBranchId === toBranchId || resolved.some(({ line, product }) => !product || Number(line.quantity) <= 0 || Number(line.quantity) > (product?.quantityAvailable ?? 0))) {
      Alert.alert('Check transfer details', 'Choose different branches, warehouses, and quantities available in the sending warehouse.');
      return;
    }
    setBusy(true);
    try {
      await createStockTransfer({
        fromWarehouse: fromWarehouseId, toWarehouse: toWarehouseId, note,
        items: resolved.map(({ line, product }) => ({ product_id: product!.productId, variant_id: product!.variantId, quantity: Number(line.quantity) })),
      });
      Alert.alert('Transfer requested', 'The receiving branch can track this transfer from the transfers screen.', [{ text: 'View transfers', onPress: () => router.replace('/transfers') }]);
    } catch (error) { Alert.alert('Could not create transfer', error instanceof Error ? error.message : 'You need access to both branches and enough stock.'); }
    finally { setBusy(false); }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!canManage) return <Screen><Text style={styles.title}>Access denied</Text></Screen>;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>New stock transfer</Text>
        <Text style={styles.help}>A request reserves no stock. Stock moves when an approved transfer is dispatched.</Text>
        <OptionPicker label="Sending branch" value={fromBranchId} options={branches.map((branch) => ({ id: branch.id, label: branch.name }))} onChange={setFromBranchId} />
        <OptionPicker label="Sending warehouse" value={fromWarehouseId} options={fromWarehouses.map((warehouse) => ({ id: warehouse.id, label: warehouse.name }))} onChange={setFromWarehouseId} />
        <OptionPicker label="Receiving branch" value={toBranchId} options={branches.filter((branch) => branch.id !== fromBranchId).map((branch) => ({ id: branch.id, label: branch.name }))} onChange={setToBranchId} />
        <OptionPicker label="Receiving warehouse" value={toWarehouseId} options={toWarehouses.map((warehouse) => ({ id: warehouse.id, label: warehouse.name }))} onChange={setToWarehouseId} />
        {lines.map((line, index) => <View key={index} style={styles.line}>
          <View style={styles.lineHeader}><Text style={styles.section}>Item {index + 1}</Text>{lines.length > 1 ? <Pressable onPress={() => setLines((current) => current.filter((_, row) => row !== index))}><Text style={styles.remove}>Remove</Text></Pressable> : null}</View>
          <OptionPicker label="Product / variant" value={line.productKey} options={products.filter((item) => item.quantityAvailable > 0).map((item) => ({ id: keyFor(item), label: `${item.name} · ${item.quantityAvailable} available` }))} onChange={(value) => updateLine(index, 'productKey', value)} />
          <FormField label="Quantity" value={line.quantity} onChangeText={(value) => updateLine(index, 'quantity', value)} keyboardType="decimal-pad" />
        </View>)}
        <AppButton title="Add another item" secondary onPress={() => setLines((current) => [...current, { productKey: null, quantity: '1' }])} />
        <FormField label="Transfer note (optional)" value={note} onChangeText={setNote} multiline />
        <AppButton title="Request transfer" onPress={save} busy={busy} disabled={!fromWarehouseId || !toWarehouseId} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 }, help: { color: colors.muted, lineHeight: 21, marginTop: 6 }, line: { borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: 'white', padding: 12, marginTop: 16 }, lineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, section: { color: colors.navy, fontWeight: '800' }, remove: { color: colors.danger, fontWeight: '700' } });

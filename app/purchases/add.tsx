import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { OptionPicker } from '@/components/OptionPicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { listBranches, listWarehousesForBranch, type Branch, type Warehouse } from '@/services/branches';
import { listPurchasableItems } from '@/services/catalog';
import { createPurchaseOrder, listSuppliers, type Supplier } from '@/services/operations';
import { colors } from '@/theme/colors';

type Purchasable = Awaited<ReturnType<typeof listPurchasableItems>>[number];
type PurchaseLine = { itemId: string | null; quantity: string; unitCost: string };
const emptyLine: PurchaseLine = { itemId: null, quantity: '1', unitCost: '' };

/** Phase 7 purchase-order form with multiple product/variant lines. */
export default function AddPurchaseOrderScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const { baseCurrency } = useCurrency();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(profile?.primary_branch_id ?? null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Purchasable[]>([]);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [lines, setLines] = useState<PurchaseLine[]>([{ ...emptyLine }]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const canManage = permissionCodes.includes('inventory.manage');

  useEffect(() => {
    listBranches().then((available) => {
      setBranches(available);
      setBranchId((current) => current ?? profile?.primary_branch_id ?? available[0]?.id ?? null);
    }).catch((error) => Alert.alert('Could not load branches', error instanceof Error ? error.message : 'Please try again.'));
  }, []);
  useEffect(() => {
    if (!branchId) return;
    Promise.all([listWarehousesForBranch(branchId), listSuppliers(branchId)]).then(([locations, vendors]) => {
      setWarehouses(locations); setSuppliers(vendors);
      setWarehouseId(locations.find((location) => location.is_primary)?.id ?? locations[0]?.id ?? null);
      setSupplierId(vendors[0]?.id ?? null);
    }).catch((error) => Alert.alert('Could not load purchase options', error instanceof Error ? error.message : 'Please try again.'));
  }, [branchId]);
  useEffect(() => { listPurchasableItems().then(setProducts).catch((error) => Alert.alert('Could not load products', error instanceof Error ? error.message : 'Please try again.')); }, []);

  function updateLine(index: number, key: keyof PurchaseLine, value: string | null) {
    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      if (key === 'itemId') {
        const product = products.find((item) => item.id === value);
        return { ...line, itemId: value, unitCost: product ? String(product.unitCost) : '' };
      }
      return { ...line, [key]: value };
    }));
  }

  async function save() {
    const selectedLines = lines.map((line) => ({ line, item: products.find((product) => product.id === line.itemId) }));
    if (!branchId || !warehouseId || !supplierId || selectedLines.some(({ line, item }) => !item || Number(line.quantity) <= 0 || Number(line.unitCost) < 0 || !Number.isFinite(Number(line.unitCost)))) {
      Alert.alert('Check purchase details', 'Choose a branch, supplier, warehouse, and valid product quantities and costs.');
      return;
    }
    setBusy(true);
    try {
      await createPurchaseOrder({
        branchId, warehouseId, supplierId, note,
        items: selectedLines.map(({ line, item }) => ({ product_id: item!.productId, variant_id: item!.variantId, quantity: Number(line.quantity), unit_cost: Number(line.unitCost) })),
      });
      Alert.alert('Purchase order created', 'You can record deliveries from the purchase list.', [{ text: 'View purchases', onPress: () => router.replace('/purchases') }]);
    } catch (error) { Alert.alert('Could not create purchase order', error instanceof Error ? error.message : 'Check stock access and try again.'); }
    finally { setBusy(false); }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!canManage) return <Screen><Text style={styles.title}>Access denied</Text></Screen>;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>New purchase order</Text>
        <OptionPicker label="Branch" value={branchId} options={branches.map((branch) => ({ id: branch.id, label: `${branch.name} · ${branch.code}` }))} onChange={setBranchId} />
        <OptionPicker label="Warehouse" value={warehouseId} options={warehouses.map((warehouse) => ({ id: warehouse.id, label: warehouse.name }))} onChange={setWarehouseId} />
        <OptionPicker label="Supplier" value={supplierId} options={suppliers.map((supplier) => ({ id: supplier.id, label: supplier.name }))} onChange={setSupplierId} />
        {lines.map((line, index) => <View key={index} style={styles.line}>
          <View style={styles.lineHeader}><Text style={styles.section}>Item {index + 1}</Text>{lines.length > 1 ? <Pressable onPress={() => setLines((current) => current.filter((_, row) => row !== index))}><Text style={styles.remove}>Remove</Text></Pressable> : null}</View>
          <OptionPicker label="Product or variant" value={line.itemId} options={products.map((item) => ({ id: item.id, label: item.label }))} onChange={(value) => updateLine(index, 'itemId', value)} />
          <FormField label="Quantity" value={line.quantity} onChangeText={(value) => updateLine(index, 'quantity', value)} keyboardType="decimal-pad" />
          <FormField label={`Unit cost (${baseCurrency})`} value={line.unitCost} onChangeText={(value) => updateLine(index, 'unitCost', value)} keyboardType="decimal-pad" />
        </View>)}
        <AppButton title="Add another item" secondary onPress={() => setLines((current) => [...current, { ...emptyLine }])} />
        <FormField label="Order note (optional)" value={note} onChangeText={setNote} multiline />
        <AppButton title="Create purchase order" onPress={save} busy={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 }, line: { borderWidth: 1, borderColor: colors.border, backgroundColor: 'white', borderRadius: 13, padding: 12, marginTop: 16 }, lineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, section: { color: colors.navy, fontWeight: '800' }, remove: { color: colors.danger, fontWeight: '700' } });

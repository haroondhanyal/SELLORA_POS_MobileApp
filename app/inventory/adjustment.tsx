import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { OptionPicker } from '@/components/OptionPicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { listPurchasableItems, listWarehouses } from '@/services/catalog';
import { adjustStock, listInventory, type InventoryRow } from '@/services/inventory';
import { colors } from '@/theme/colors';

/** Records a reasoned stock increase or decrease through the protected stock RPC. */
export default function StockAdjustmentScreen() {
  const params = useLocalSearchParams<{ productId?: string; variantId?: string; warehouseId?: string }>();
  const { profile, permissionCodes, session, locked } = useAuth();
  const [products, setProducts] = useState<Awaited<ReturnType<typeof listPurchasableItems>>>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; label: string; branch_id: string }[]>([]);
  const [stockRows, setStockRows] = useState<InventoryRow[]>([]);
  const [productKey, setProductKey] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(params.warehouseId ?? null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const canAdjust = permissionCodes.includes('inventory.manage');

  useEffect(() => {
    let active = true;
    Promise.all([listPurchasableItems(), listWarehouses(), listInventory()]).then(([items, locations, stock]) => {
      if (!active) return;
      setProducts(items);
      const initialProduct = items.find((item) => item.productId === params.productId
        && item.variantId === (params.variantId || null));
      if (initialProduct) setProductKey(initialProduct.id);
      setWarehouses(locations);
      setStockRows(stock);
    }).catch((error) => Alert.alert('Could not load adjustment options', error instanceof Error ? error.message : 'Please try again.'));
    return () => { active = false; };
  }, []);

  const selectedProduct = products.find((item) => item.id === productKey);
  const currentStock = stockRows.find((row) => row.product_id === selectedProduct?.productId
    && row.variant_id === selectedProduct?.variantId && row.warehouse_id === warehouseId)?.quantity ?? 0;

  async function submit() {
    const amount = Number(delta);
    if (!selectedProduct || !warehouseId || !Number.isFinite(amount) || amount === 0 || reason.trim().length < 3) {
      Alert.alert('Check adjustment details', 'Choose a product and warehouse, enter a non-zero quantity and explain why stock is changing.');
      return;
    }
    setBusy(true);
    try {
      await adjustStock({ warehouseId, productId: selectedProduct.productId, variantId: selectedProduct.variantId, quantityDelta: amount, reason });
      Alert.alert('Stock updated', 'The adjustment and its reason have been recorded.', [{ text: 'View inventory', onPress: () => router.replace('/inventory') }]);
    } catch (error) {
      Alert.alert('Could not adjust stock', error instanceof Error ? error.message : 'Check your branch access and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!canAdjust) return <Screen><Text style={styles.title}>Access denied</Text></Screen>;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Stock adjustment</Text>
        <Text style={styles.help}>Every stock change is saved with your account and the reason you enter.</Text>
        <OptionPicker label="Product or variant" value={productKey} options={products.map((item) => ({ id: item.id, label: item.label }))} onChange={setProductKey} />
        <OptionPicker label="Warehouse" value={warehouseId} options={warehouses} onChange={setWarehouseId} />
        <Text style={styles.stock}>Current stock: {currentStock}</Text>
        <FormField label="Quantity change (+ add, − remove)" value={delta} onChangeText={setDelta} keyboardType="numbers-and-punctuation" />
        <FormField label="Reason" value={reason} onChangeText={setReason} placeholder="Count correction, damage, opening stock…" multiline />
        <AppButton title="Save adjustment" onPress={submit} busy={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 30 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  help: { color: colors.muted, lineHeight: 21, marginTop: 6 },
  stock: { color: colors.tealDark, fontWeight: '800', marginTop: 16 },
});

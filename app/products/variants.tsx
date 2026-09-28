import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { useConnection } from '@/providers/ConnectionProvider';
import { addProductVariant, deactivateProductVariant, getProduct, listProductVariants, updateProductVariant, type CatalogProduct, type ProductVariant } from '@/services/catalog';
import { colors } from '@/theme/colors';

type Variant = ProductVariant;

/** Phase 4 variant screen for products sold in multiple sizes or packages. */
export default function ProductVariantsScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { profile, permissionCodes, session, locked } = useAuth();
  const { formatMoney, baseCurrency } = useCurrency();
  const { connected, mode } = useConnection();
  const online = connected && mode === 'online';
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = permissionCodes.includes('products.manage');

  async function load() {
    if (!productId) return;
    try {
      const [parent, result] = await Promise.all([getProduct(productId), listProductVariants(productId)]);
      setProduct(parent);
      setVariants(result);
    } catch (error) {
      Alert.alert('Could not load variants', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  useEffect(() => { void load(); }, [productId]);

  async function addVariant() {
    if (!productId || name.trim().length < 1 || sku.trim().length < 2
      || (salePrice && (!Number.isFinite(Number(salePrice)) || Number(salePrice) < 0))
      || (costPrice && (!Number.isFinite(Number(costPrice)) || Number(costPrice) < 0))) {
      Alert.alert('Check variant details', 'Enter a name and SKU. Prices must be valid non-negative amounts.');
      return;
    }
    setBusy(true);
    try {
      const draft = { name, sku, barcode, salePrice: salePrice ? Number(salePrice) : null, costPrice: costPrice ? Number(costPrice) : null };
      if (editingId) await updateProductVariant(editingId, draft);
      else await addProductVariant({ productId, ...draft });
      clearForm();
      await load();
    } catch (error) {
      Alert.alert('Could not add variant', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function editVariant(variant: Variant) {
    setEditingId(variant.id); setName(variant.name); setSku(variant.sku); setBarcode(variant.barcode ?? '');
    setSalePrice(variant.sale_price == null ? '' : String(variant.sale_price));
    setCostPrice(variant.cost_price == null ? '' : String(variant.cost_price));
  }

  function clearForm() {
    setEditingId(null); setName(''); setSku(''); setBarcode(''); setSalePrice(''); setCostPrice('');
  }

  function removeVariant(variant: Variant) {
    Alert.alert('Archive this variant?', `${variant.name} will disappear from new sales. Past receipts are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => { void (async () => {
        setBusy(true);
        try { await deactivateProductVariant(variant.id); if (editingId === variant.id) clearForm(); await load(); }
        catch (error) { Alert.alert('Could not archive variant', error instanceof Error ? error.message : 'Please try again.'); }
        finally { setBusy(false); }
      })(); } },
    ]);
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!productId) return <Screen><Text style={styles.title}>Choose a product first.</Text></Screen>;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Product variants</Text>
        <Text style={styles.help}>{product?.name ?? 'Loading product…'} · each variant can have its own SKU, barcode and price.</Text>
        {!online ? <Text style={styles.help}>Add and edit changes are saved on this device and sync after reconnecting. New variants are not available for offline checkout until synced. Archiving needs a server connection.</Text> : null}
        {canEdit ? <>
          <FormField label="Variant name (e.g. Large / 500 g)" value={name} onChangeText={setName} />
          <FormField label="Variant SKU" value={sku} onChangeText={setSku} autoCapitalize="characters" />
          <FormField label="Barcode" value={barcode} onChangeText={setBarcode} keyboardType="number-pad" />
          <FormField label={`Sale price override (${baseCurrency}, optional)`} value={salePrice} onChangeText={setSalePrice} keyboardType="decimal-pad" />
          <FormField label={`Cost price override (${baseCurrency}, optional)`} value={costPrice} onChangeText={setCostPrice} keyboardType="decimal-pad" />
          <AppButton title={editingId ? 'Save variant changes' : 'Add variant'} onPress={addVariant} busy={busy} />
          {editingId ? <AppButton title="Cancel edit" onPress={clearForm} secondary /> : null}
        </> : null}
        {variants.map((variant) => (
          <View key={variant.id} style={styles.card}>
            <Text style={styles.name}>{variant.name}</Text>
            <Text style={styles.help}>SKU {variant.sku}{variant.barcode ? ` · Barcode ${variant.barcode}` : ''}</Text>
            {variant.sale_price !== null ? <Text style={styles.price}>{formatMoney(Number(variant.sale_price))}</Text> : null}
            {canEdit ? <View style={styles.actions}><AppButton title="Edit" secondary onPress={() => editVariant(variant)} /><AppButton title="Archive" secondary onPress={() => removeVariant(variant)} disabled={!online} /></View> : null}
          </View>
        ))}
        {variants.length === 0 ? <Text style={styles.empty}>This product has no variants yet.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 28 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  help: { color: colors.muted, marginTop: 6, lineHeight: 21 },
  card: { backgroundColor: 'white', borderRadius: 12, borderColor: colors.border, borderWidth: 1, padding: 14, marginTop: 12 },
  name: { color: colors.navy, fontWeight: '800', fontSize: 16 },
  price: { color: colors.tealDark, fontWeight: '700', marginTop: 5 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 30 },
});

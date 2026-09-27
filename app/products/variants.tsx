import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { addProductVariant, getProduct, type CatalogProduct } from '@/services/catalog';
import { requireSupabase } from '@/services/supabase';
import { colors } from '@/theme/colors';

type Variant = { id: string; name: string; sku: string; barcode: string | null; sale_price: number | null };

/** Phase 4 variant screen for products sold in multiple sizes or packages. */
export default function ProductVariantsScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const { profile, permissionCodes, session, locked } = useAuth();
  const { formatMoney, baseCurrency } = useCurrency();
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const canEdit = permissionCodes.includes('products.manage');

  async function load() {
    if (!productId) return;
    try {
      const [parent, result] = await Promise.all([
        getProduct(productId),
        requireSupabase().from('product_variants').select('id, name, sku, barcode, sale_price').eq('product_id', productId).eq('is_active', true).order('name'),
      ]);
      if (result.error) throw result.error;
      setProduct(parent);
      setVariants((result.data ?? []) as Variant[]);
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
      await addProductVariant({
        productId, name, sku, barcode,
        salePrice: salePrice ? Number(salePrice) : null,
        costPrice: costPrice ? Number(costPrice) : null,
      });
      setName(''); setSku(''); setBarcode(''); setSalePrice(''); setCostPrice('');
      await load();
    } catch (error) {
      Alert.alert('Could not add variant', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
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
        {canEdit ? <>
          <FormField label="Variant name (e.g. Large / 500 g)" value={name} onChangeText={setName} />
          <FormField label="Variant SKU" value={sku} onChangeText={setSku} autoCapitalize="characters" />
          <FormField label="Barcode" value={barcode} onChangeText={setBarcode} keyboardType="number-pad" />
          <FormField label={`Sale price override (${baseCurrency}, optional)`} value={salePrice} onChangeText={setSalePrice} keyboardType="decimal-pad" />
          <FormField label={`Cost price override (${baseCurrency}, optional)`} value={costPrice} onChangeText={setCostPrice} keyboardType="decimal-pad" />
          <AppButton title="Add variant" onPress={addVariant} busy={busy} />
        </> : null}
        {variants.map((variant) => (
          <View key={variant.id} style={styles.card}>
            <Text style={styles.name}>{variant.name}</Text>
            <Text style={styles.help}>SKU {variant.sku}{variant.barcode ? ` · Barcode ${variant.barcode}` : ''}</Text>
            {variant.sale_price !== null ? <Text style={styles.price}>{formatMoney(Number(variant.sale_price))}</Text> : null}
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
  empty: { color: colors.muted, textAlign: 'center', marginTop: 30 },
});

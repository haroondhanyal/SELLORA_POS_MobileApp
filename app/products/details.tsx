import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { getProduct, getProductImageUrl, type CatalogProduct } from '@/services/catalog';
import { requireSupabase } from '@/services/supabase';
import { colors } from '@/theme/colors';

/** Read-only product detail route available to any role allowed to browse products. */
export default function ProductDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, permissionCodes, session, locked } = useAuth();
  const { formatMoney } = useCurrency();
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [variants, setVariants] = useState<{ id: string; name: string; sku: string; sale_price: number | null }[]>([]);

  useEffect(() => {
    if (!id) return;
    getProduct(id).then(async (item) => {
      setProduct(item);
      setImageUrl(await getProductImageUrl(item.image_storage_path));
      const { data, error } = await requireSupabase().from('product_variants').select('id, name, sku, sale_price').eq('product_id', id).eq('is_active', true).order('name');
      if (error) throw error;
      setVariants((data ?? []) as typeof variants);
    }).catch((error) => Alert.alert('Could not load product', error instanceof Error ? error.message : 'Please try again.'));
  }, [id]);

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!id) return <Screen><Text style={styles.title}>Product id is missing.</Text></Screen>;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} /> : null}
        <Text style={styles.title}>{product?.name ?? 'Loading product…'}</Text>
        {product ? <>
          <Text style={styles.meta}>SKU {product.sku}{product.barcode ? ` · Barcode ${product.barcode}` : ''}</Text>
          {product.description ? <Text style={styles.body}>{product.description}</Text> : null}
          <Text style={styles.price}>{formatMoney(Number(product.sale_price))}</Text>
          <Text style={styles.body}>Unit: {product.unit} · Tax: {Number(product.tax_rate)}%</Text>
          {variants.map((variant) => <View key={variant.id} style={styles.variant}>
            <Text style={styles.variantName}>{variant.name}</Text>
            <Text style={styles.meta}>SKU {variant.sku}</Text>
            {variant.sale_price !== null ? <Text style={styles.priceSmall}>{formatMoney(Number(variant.sale_price))}</Text> : null}
          </View>)}
          {permissionCodes.includes('products.manage')
            ? <AppButton title="Edit product" onPress={() => router.push({ pathname: '/products/edit', params: { id } })} />
            : null}
        </> : null}
        <AppButton title="Back to products" onPress={() => router.replace('/products')} secondary />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { paddingBottom: 30 }, image: { width: '100%', height: 230, borderRadius: 16, marginTop: 18 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 }, meta: { color: colors.muted, marginTop: 7 }, body: { color: colors.text, marginTop: 12, lineHeight: 22 }, price: { color: colors.tealDark, fontSize: 23, fontWeight: '900', marginTop: 14 }, variant: { padding: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: 'white', borderRadius: 12, marginTop: 10 }, variantName: { color: colors.navy, fontWeight: '800' }, priceSmall: { color: colors.tealDark, fontWeight: '800', marginTop: 5 } });

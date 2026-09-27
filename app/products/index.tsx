import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, Redirect, router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { OptionPicker } from '@/components/OptionPicker';
import { ProductCard } from '@/components/ProductCard';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { getProductImageUrl, listBrands, listCategories, listProducts, type CatalogProduct } from '@/services/catalog';
import { colors } from '@/theme/colors';

/** Phase 4 catalogue list with search, filters, barcode lookup, and product navigation. */
export default function ProductsScreen() {
  const { profile, permissionCodes, locked, session } = useAuth();
  const params = useLocalSearchParams<{ barcode?: string }>();
  const { formatMoney } = useCurrency();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; label: string }[]>([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canEdit = permissionCodes.includes('products.manage');

  async function loadCatalog() {
    setLoading(true);
    try {
      const [items, categoryOptions, brandOptions] = await Promise.all([listProducts(), listCategories(), listBrands()]);
      setProducts(items);
      setCategories(categoryOptions);
      setBrands(brandOptions);
      const photos = await Promise.all(items.map(async (product) => [product.id, await getProductImageUrl(product.image_storage_path)] as const));
      setImageUrls(Object.fromEntries(photos.filter(([, url]) => Boolean(url))) as Record<string, string>);
    } catch (error) {
      Alert.alert('Could not load products', error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCatalog(); }, []);
  useEffect(() => { if (params.barcode) setSearch(params.barcode); }, [params.barcode]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery = !query || [product.name, product.sku, product.barcode ?? ''].some((value) => value.toLowerCase().includes(query));
      return matchesQuery && (!categoryId || product.category_id === categoryId) && (!brandId || product.brand_id === brandId);
    });
  }, [products, search, categoryId, brandId]);

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Products</Text>
        <Text style={styles.body}>Search your catalogue and keep product details in one place.</Text>
        <FormField label="Search products, SKU or barcode" value={search} onChangeText={setSearch} autoCapitalize="none" />
        <View style={styles.actions}>
          <AppButton title="Scan barcode" onPress={() => router.push('/products/barcode')} secondary />
          {canEdit ? <AppButton title="Add product" onPress={() => router.push('/products/add')} /> : null}
        </View>
        <View style={styles.actions}>
          <Link href="/products/categories" style={styles.link}>Categories</Link>
          <Link href="/products/brands" style={styles.link}>Brands</Link>
        </View>
        <OptionPicker label="Category filter" value={categoryId} options={categories} onChange={setCategoryId} allowNone />
        <OptionPicker label="Brand filter" value={brandId} options={brands} onChange={setBrandId} allowNone />
        {loading ? <Text style={styles.body}>Loading products…</Text> : null}
        {!loading && visibleProducts.length === 0 ? <Text style={styles.empty}>No products match this search.</Text> : null}
        {visibleProducts.map((product) => (
          <ProductCard
            key={product.id}
            name={product.name}
            sku={product.sku}
            price={formatMoney(Number(product.sale_price))}
            imageUrl={imageUrls[product.id]}
            onPress={() => router.push({ pathname: canEdit ? '/products/edit' : '/products/details', params: { id: product.id } })}
          />
        ))}
        <Pressable onPress={() => void loadCatalog()} style={styles.refresh}><Text style={styles.link}>Refresh list</Text></Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: 2, paddingBottom: 30 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  body: { color: colors.muted, lineHeight: 21, marginTop: 7 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  link: { color: colors.tealDark, fontWeight: '800', paddingVertical: 10, marginRight: 14 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 36 },
  refresh: { alignSelf: 'center', marginTop: 14 },
});

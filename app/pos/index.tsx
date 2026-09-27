import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { OptionPicker } from '@/components/OptionPicker';
import { ProductCard } from '@/components/ProductCard';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useConnection } from '@/providers/ConnectionProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { useCart, cartKey } from '@/providers/CartProvider';
import { getProductImageUrl, listBrands, listCategories, listBranchWarehouses, listSellableItems } from '@/services/catalog';
import type { SellableProduct } from '@/providers/CartProvider';
import { colors } from '@/theme/colors';

/** Phase 5 POS catalogue with search, barcode, category/brand filters and cart actions. */
export default function PosScreen() {
  const params = useLocalSearchParams<{ barcode?: string }>();
  const { profile, permissionCodes, session, locked } = useAuth();
  const { mode } = useConnection();
  const { formatMoney } = useCurrency();
  const { items: cartItems, addItem, setWarehouse } = useCart();
  const [products, setProducts] = useState<SellableProduct[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [warehouses, setWarehouses] = useState<{ id: string; label: string; branch_id: string; is_primary: boolean }[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; label: string }[]>([]);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const canSell = permissionCodes.includes('sales.create');

  useEffect(() => { if (params.barcode) setQuery(params.barcode); }, [params.barcode]);
  useEffect(() => {
    if (!profile?.primary_branch_id) return;
    Promise.all([listBranchWarehouses(profile.primary_branch_id), listCategories(), listBrands()]).then(([locations, categoryOptions, brandOptions]) => {
      setWarehouses(locations);
      setCategories(categoryOptions);
      setBrands(brandOptions);
      const startingLocation = locations.find((location) => location.id === warehouseId)
        ?? locations.find((location) => location.is_primary)
        ?? locations[0];
      if (startingLocation) { setWarehouseId(startingLocation.id); setWarehouse(startingLocation.id); }
    }).catch((error) => Alert.alert('Could not load POS setup', error instanceof Error ? error.message : 'Please try again.'));
  }, [profile?.primary_branch_id]);

  useEffect(() => {
    let active = true;
    async function loadItems() {
      if (!warehouseId) { setProducts([]); return; }
      setLoading(true);
      try {
        const sellable = await listSellableItems(warehouseId);
        if (!active) return;
        setProducts(sellable);
        const images = await Promise.all(sellable.map(async (product) => [product.productId, await getProductImageUrl(product.imagePath)] as const));
        if (active) setPhotoUrls(Object.fromEntries(images.filter(([, uri]) => Boolean(uri))) as Record<string, string>);
      } catch (error) {
        Alert.alert('Could not load POS products', error instanceof Error ? error.message : 'Check your branch and permissions.');
      } finally { if (active) setLoading(false); }
    }
    void loadItems();
    return () => { active = false; };
  }, [warehouseId]);

  const visibleProducts = useMemo(() => {
    const search = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchText = !search || `${product.name} ${product.sku} ${product.barcode ?? ''}`.toLowerCase().includes(search);
      const matchCategory = !categoryId || product.categoryId === categoryId;
      const matchBrand = !brandId || product.brandId === brandId;
      return matchText && matchCategory && matchBrand;
    });
  }, [products, query, categoryId, brandId]);

  function addToCart(product: SellableProduct) {
    const existing = cartItems.find((item) => cartKey(item) === cartKey(product));
    if (product.quantityAvailable <= (existing?.quantity ?? 0)) {
      Alert.alert('Not enough stock', `${product.name} has ${product.quantityAvailable} available in this warehouse.`);
      return;
    }
    addItem(product);
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!canSell) return <Screen><Text style={styles.title}>Sales access required</Text><Text style={styles.help}>Your current role cannot create sales.</Text></Screen>;
  if (mode === 'offline') return <Screen><AppHeader profile={profile} /><Text style={styles.title}>Offline sales are not enabled yet</Text><Text style={styles.help}>Sellora is currently set to Offline Mode. Switch Online from the header to create a sale. Local sale queuing will arrive with the offline sync phase.</Text></Screen>;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <View style={styles.heading}>
          <View><Text style={styles.title}>Point of sale</Text><Text style={styles.help}>Select items to add them to the cart.</Text></View>
          <Pressable style={styles.cartButton} onPress={() => router.push('/pos/cart')}><Text style={styles.cartText}>Cart · {cartItems.reduce((count, item) => count + item.quantity, 0)}</Text></Pressable>
        </View>
        {!profile?.primary_branch_id ? <Text style={styles.empty}>Your administrator must assign a branch before you can create a sale.</Text> : null}
        <OptionPicker label="Warehouse" value={warehouseId} options={warehouses} onChange={(id) => { setWarehouseId(id); setWarehouse(id); }} />
        <FormField label="Search name, SKU or barcode" value={query} onChangeText={setQuery} autoCapitalize="none" />
        <AppButton title="Scan barcode" secondary onPress={() => router.push({ pathname: '/products/barcode', params: { returnTo: 'pos' } })} />
        <OptionPicker label="Category" value={categoryId} options={categories} onChange={setCategoryId} allowNone />
        <OptionPicker label="Brand" value={brandId} options={brands} onChange={setBrandId} allowNone />
        {loading ? <Text style={styles.help}>Loading products…</Text> : null}
        {visibleProducts.map((product) => {
          const key = cartKey(product);
          return <ProductCard key={key} name={product.name} sku={product.sku} price={formatMoney(product.price)} stock={`${product.quantityAvailable} available`} imageUrl={photoUrls[product.productId]} onPress={() => addToCart(product)} favorite={favorites.has(key)} onToggleFavorite={() => setFavorites((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} />;
        })}
        {!loading && visibleProducts.length === 0 ? <Text style={styles.empty}>No products found in this warehouse.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 30 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22 },
  title: { color: colors.navy, fontSize: 27, fontWeight: '800' },
  help: { color: colors.muted, lineHeight: 21, marginTop: 5 },
  cartButton: { backgroundColor: colors.navy, borderRadius: 12, padding: 12 },
  cartText: { color: 'white', fontWeight: '800' },
  empty: { color: colors.muted, textAlign: 'center', lineHeight: 22, marginTop: 28 },
});

import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { ProductCard } from '@/components/ProductCard';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { getProductImageUrl } from '@/services/catalog';
import { listInventory, type InventoryRow } from '@/services/inventory';
import { listCachedInventory } from '@/services/inventory';
import { colors } from '@/theme/colors';
import { useConnection } from '@/providers/ConnectionProvider';
import { requireSupabase } from '@/services/supabase';

/** Phase 4 inventory list for products held in the user's assigned branches. */
export default function InventoryScreen() {
  const { formatMoney } = useCurrency();
  const { profile, permissionCodes, session, locked } = useAuth();
  const { mode } = useConnection();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const canView = permissionCodes.includes('inventory.view') || permissionCodes.includes('inventory.manage');
  const canAdjust = permissionCodes.includes('inventory.manage');

  async function load() {
    setLoading(true);
    try {
      const stockRows = mode === 'offline' && profile?.primary_branch_id ? await listCachedInventory(profile.primary_branch_id) : await listInventory();
      setRows(stockRows);
      const images = mode === 'offline' ? [] : await Promise.all(stockRows.map(async (row) => [row.product_id, await getProductImageUrl(row.products?.image_storage_path ?? null)] as const));
      setPhotoUrls(Object.fromEntries(images.filter(([, uri]) => Boolean(uri))) as Record<string, string>);
    } catch (error) {
      Alert.alert('Could not load stock', error instanceof Error ? error.message : 'Check your access and connection.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [mode, profile?.primary_branch_id]);
  useEffect(() => {
    if (mode !== 'online' || !profile?.primary_branch_id) return;
    const channel = requireSupabase().channel(`sellora-inventory-${profile.primary_branch_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => void load())
      .subscribe();
    return () => { void requireSupabase().removeChannel(channel); };
  }, [mode, profile?.primary_branch_id]);
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => !query || `${row.products?.name ?? ''} ${row.products?.sku ?? ''} ${row.warehouses?.name ?? ''}`.toLowerCase().includes(query));
  }, [rows, search]);

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Inventory</Text>
        <Text style={styles.help}>View current stock by product and warehouse.</Text>
        <FormField label="Search name, SKU or warehouse" value={search} onChangeText={setSearch} />
        {canAdjust && mode === 'online' ? <AppButton title="Adjust stock" onPress={() => router.push('/inventory/adjustment')} /> : null}
        {canView && mode === 'online' ? <AppButton title="Adjustment history" onPress={() => router.push('/inventory/adjustments')} secondary /> : null}
        {mode === 'offline' ? <Text style={styles.help}>Offline view uses the last saved stock snapshot. Stock changes need an online connection.</Text> : null}
        {!canView ? <Text style={styles.empty}>Your role does not have inventory access.</Text> : null}
        {loading ? <Text style={styles.help}>Loading stock…</Text> : null}
        {canView && !loading && visibleRows.map((row) => {
          const product = row.products;
          if (!product) return null;
          const threshold = Math.max(Number(product.minimum_stock), Number(product.reorder_level));
          const low = Number(row.quantity) <= threshold;
          return (
            <View key={row.id}>
              <ProductCard
                name={row.product_variants ? `${product.name} · ${row.product_variants.name}` : product.name}
                sku={row.product_variants?.sku ?? product.sku}
                price={formatMoney(Number(product.sale_price))}
                stock={`${Number(row.quantity)} in ${row.warehouses?.name ?? 'warehouse'}${low ? ' · Reorder' : ''}`}
                imageUrl={photoUrls[row.product_id]}
                onPress={canAdjust ? () => router.push({ pathname: '/inventory/adjustment', params: { productId: row.product_id, variantId: row.variant_id ?? '', warehouseId: row.warehouse_id } }) : undefined}
              />
            </View>
          );
        })}
        {canView && !loading && visibleRows.length === 0 ? <Text style={styles.empty}>No stock found for this search.</Text> : null}
        <Pressable onPress={() => void load()} style={styles.refresh}><Text style={styles.refreshText}>Refresh stock</Text></Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 30 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  help: { color: colors.muted, marginTop: 6, lineHeight: 21 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 28 },
  refresh: { alignSelf: 'center', padding: 12, marginTop: 8 },
  refreshText: { color: colors.tealDark, fontWeight: '800' },
});

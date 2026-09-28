import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Switch, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { DatePickerField } from '@/components/DatePickerField';
import { FormField } from '@/components/FormField';
import { OptionPicker } from '@/components/OptionPicker';
import { ProfileImagePicker } from '@/components/ProfileImagePicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { useConnection } from '@/providers/ConnectionProvider';
import { getProduct, getProductImageUrl, listBrands, listCategories, saveProduct, stageOfflineProductImage, uploadProductImage, type ProductDraft } from '@/services/catalog';
import { isOfflineWorkMode } from '@/services/connectivity';
import { requireDatabase } from '@/services/database';
import { deletePrivateFiles } from '@/services/storage';
import { colors } from '@/theme/colors';

type ProductFormValues = Omit<ProductDraft, 'cost_price' | 'sale_price' | 'tax_rate' | 'minimum_stock' | 'reorder_level'> & {
  cost_price: string;
  sale_price: string;
  tax_rate: string;
  minimum_stock: string;
  reorder_level: string;
};

const emptyProduct: ProductFormValues = {
  name: '', description: '', sku: '', barcode: '', category_id: null, brand_id: null,
  image_storage_path: null, unit: 'each', cost_price: '', sale_price: '', tax_rate: '0',
  minimum_stock: '0', reorder_level: '0', expiry_enabled: false, batch_enabled: false, serial_enabled: false,
};

/** Shared create/edit screen for a catalogue item; all fields map directly to products columns. */
export function ProductForm({ productId }: { productId?: string }) {
  const params = useLocalSearchParams<{ barcode?: string }>();
  const { profile, permissionCodes, session, locked } = useAuth();
  const { baseCurrency } = useCurrency();
  const { connected, mode } = useConnection();
  const [form, setForm] = useState<ProductFormValues>(emptyProduct);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; label: string }[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [savedPhoto, setSavedPhoto] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const canEdit = permissionCodes.includes('products.manage');

  useEffect(() => {
    let active = true;
    async function loadForm() {
      try {
        const [categoryOptions, brandOptions] = await Promise.all([listCategories(), listBrands()]);
        if (active) { setCategories(categoryOptions); setBrands(brandOptions); }
        if (!productId) return;
        const product = await getProduct(productId);
        const imageUrl = await getProductImageUrl(product.image_storage_path);
        if (!active) return;
        setSavedPhoto(imageUrl);
        setForm({
          ...product,
          cost_price: String(product.cost_price), sale_price: String(product.sale_price),
          tax_rate: String(product.tax_rate), minimum_stock: String(product.minimum_stock),
          reorder_level: String(product.reorder_level),
        });
      } catch (error) {
        Alert.alert('Could not load product form', error instanceof Error ? error.message : 'Please try again.');
      }
    }
    void loadForm();
    return () => { active = false; };
  }, [productId]);

  useEffect(() => {
    if (params.barcode) update('barcode', params.barcode);
  }, [params.barcode]);

  function update<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    const numbers = [form.cost_price, form.sale_price, form.tax_rate, form.minimum_stock, form.reorder_level].map(Number);
    if (form.name.trim().length < 2 || form.sku.trim().length < 2 || form.unit.trim().length < 1
      || !form.sale_price.trim() || numbers.some((value) => !Number.isFinite(value) || value < 0)
      || Number(form.sale_price) <= 0 || Number(form.tax_rate) > 100) {
      Alert.alert('Check product details', 'Enter a name, SKU, unit, a sale price above zero, and valid cost, tax (0–100%) and stock values.');
      return;
    }

    setBusy(true);
    let uploadedPath: string | null = null;
    let productSaved = false;
    try {
      const offline = await isOfflineWorkMode();
      let imagePath = removePhoto ? null : form.image_storage_path;
      if (photo) {
        if (offline) imagePath = await stageOfflineProductImage(photo);
        else {
          const uploaded = await uploadProductImage(photo);
          imagePath = uploaded.path;
          uploadedPath = uploaded.path;
        }
      }

      const draft: ProductDraft = {
        ...form,
        name: form.name.trim(), description: form.description.trim(), sku: form.sku.trim(),
        barcode: form.barcode.trim(), unit: form.unit.trim(), image_storage_path: imagePath,
        cost_price: Number(form.cost_price), sale_price: Number(form.sale_price),
        tax_rate: Number(form.tax_rate), minimum_stock: Number(form.minimum_stock),
        reorder_level: Number(form.reorder_level),
      };
      const id = await saveProduct(draft, productId);
      productSaved = true;

      if (form.image_storage_path && form.image_storage_path !== imagePath) {
        await deletePrivateFiles('products', [form.image_storage_path]).catch(() => {});
      }
      if (offline) {
        Alert.alert('Saved offline', 'This product change is stored on this device and will sync when the Sellora server is reachable.', [
          { text: 'Product list', onPress: () => router.replace('/products') },
        ]);
      } else {
        Alert.alert('Product saved', 'Product details are up to date.', [
          { text: 'Manage variants', onPress: () => router.replace({ pathname: '/products/variants', params: { productId: id } }) },
          { text: 'Product list', onPress: () => router.replace('/products') },
        ]);
      }
    } catch (error) {
      if (uploadedPath && !productSaved) await deletePrivateFiles('products', [uploadedPath]).catch(() => {});
      Alert.alert('Could not save product', error instanceof Error ? error.message : 'Check your access and connection.');
    } finally {
      setBusy(false);
    }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!canEdit) return <Screen><Text style={styles.title}>Access denied</Text></Screen>;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>{productId ? 'Edit product' : 'Add product'}</Text>
        <Text style={styles.help}>Set catalogue, price and stock warning details for this item.</Text>
        {mode === 'offline' || !connected ? <Text style={styles.offlineNote}>Changes are saved on this device and sync after reconnecting. Product photos stay on this device until upload.</Text> : null}
        <ProfileImagePicker
          label="Product image"
          uri={photo ?? (removePhoto ? null : savedPhoto)}
          onChange={(uri) => { setPhoto(uri); setRemovePhoto(uri === null); }}
        />
        <FormField label="Product name" value={form.name} onChangeText={(value) => update('name', value)} />
        <FormField label="SKU" value={form.sku} onChangeText={(value) => update('sku', value)} autoCapitalize="characters" />
        <FormField label="Barcode" value={form.barcode} onChangeText={(value) => update('barcode', value)} keyboardType="number-pad" />
        <AppButton title="Scan barcode" secondary onPress={() => router.push({ pathname: '/products/barcode', params: { returnTo: productId ? 'edit' : 'add', productId } })} />
        <FormField label="Description" value={form.description} onChangeText={(value) => update('description', value)} multiline />
        <OptionPicker label="Category" value={form.category_id} options={categories} onChange={(value) => update('category_id', value)} allowNone />
        <OptionPicker label="Brand" value={form.brand_id} options={brands} onChange={(value) => update('brand_id', value)} allowNone />
        <FormField label="Unit" value={form.unit} onChangeText={(value) => update('unit', value)} placeholder="each, kg, box…" />
        <FormField label={`Cost price (${baseCurrency})`} value={form.cost_price} onChangeText={(value) => update('cost_price', value)} keyboardType="decimal-pad" />
        <FormField label={`Sale price (${baseCurrency})`} value={form.sale_price} onChangeText={(value) => update('sale_price', value)} keyboardType="decimal-pad" />
        <FormField label="Tax rate (%)" value={form.tax_rate} onChangeText={(value) => update('tax_rate', value)} keyboardType="decimal-pad" />
        <FormField label="Minimum stock" value={form.minimum_stock} onChangeText={(value) => update('minimum_stock', value)} keyboardType="decimal-pad" />
        <FormField label="Reorder level" value={form.reorder_level} onChangeText={(value) => update('reorder_level', value)} keyboardType="decimal-pad" />
        <SwitchRow label="Track expiry dates" value={form.expiry_enabled} onChange={(value) => update('expiry_enabled', value)} />
        <SwitchRow label="Track batches" value={form.batch_enabled} onChange={(value) => update('batch_enabled', value)} />
        <SwitchRow label="Track serial numbers" value={form.serial_enabled} onChange={(value) => update('serial_enabled', value)} />
        <AppButton title={productId ? 'Save product changes' : 'Create product'} onPress={submit} busy={busy} />
        {productId ? <AppButton title="Manage variants" onPress={() => router.push({ pathname: '/products/variants', params: { productId } })} secondary /> : null}
      </View>
    </Screen>
  );
}

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.switchRow}><Text style={styles.switchLabel}>{label}</Text><Switch value={value} onValueChange={onChange} trackColor={{ true: colors.teal }} /></View>;
}

const styles = StyleSheet.create({
  page: { gap: 4, paddingBottom: 30 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  help: { color: colors.muted, lineHeight: 21, marginTop: 5 },
  offlineNote: { color: colors.warning, lineHeight: 21, marginTop: 10, fontWeight: '600' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomColor: colors.border, borderBottomWidth: 1 },
  switchLabel: { color: colors.text, fontWeight: '600' },
});

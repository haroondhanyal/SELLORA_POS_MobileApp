import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { decryptLocalJson, encryptLocalJson } from '@/services/localEncryption';
import * as FileSystem from 'expo-file-system/legacy';
import { requireSupabase } from '@/services/supabase';
import type { PickerOption } from '@/components/OptionPicker';
import type { SellableProduct } from '@/providers/CartProvider';

export type ProductDraft = {
  name: string;
  description: string;
  sku: string;
  barcode: string;
  category_id: string | null;
  brand_id: string | null;
  image_storage_path: string | null;
  unit: string;
  cost_price: number;
  sale_price: number;
  tax_rate: number;
  minimum_stock: number;
  reorder_level: number;
  expiry_enabled: boolean;
  batch_enabled: boolean;
  serial_enabled: boolean;
};

export type CatalogProduct = ProductDraft & { id: string; is_active: boolean };
export type SimpleCatalogEntry = PickerOption & { description?: string; is_active?: boolean };

/** Reads active categories for product and inventory filters. */
export async function listCategories() {
  const { data, error } = await requireSupabase().from('categories').select('id, name, description, is_active').eq('is_active', true).order('name');
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, label: row.name, description: row.description, is_active: row.is_active })) as SimpleCatalogEntry[];
}

/** Reads active brands for product forms and filters. */
export async function listBrands() {
  const { data, error } = await requireSupabase().from('brands').select('id, name, description, is_active').eq('is_active', true).order('name');
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, label: row.name, description: row.description, is_active: row.is_active })) as SimpleCatalogEntry[];
}

/** Loads products for the screen; search stays local so offline cached rows can be reused later. */
export async function listProducts() {
  const { data, error } = await requireSupabase()
    .from('products')
    .select('id, name, description, sku, barcode, category_id, brand_id, image_storage_path, unit, cost_price, sale_price, tax_rate, minimum_stock, reorder_level, expiry_enabled, batch_enabled, serial_enabled, is_active')
    .eq('is_active', true)
    .order('name')
    .limit(500);
  if (error) throw error;
  return (data ?? []) as CatalogProduct[];
}

/** Loads one product for the edit screen. */
export async function getProduct(productId: string) {
  const { data, error } = await requireSupabase().from('products').select('*').eq('id', productId).single();
  if (error) throw error;
  return data as CatalogProduct;
}

/** Creates or edits a product and records which signed-in staff member created it. */
export async function saveProduct(draft: ProductDraft, productId?: string) {
  const client = requireSupabase();
  if (productId) {
    const { error } = await client.from('products').update({ ...draft, updated_at: new Date().toISOString() }).eq('id', productId);
    if (error) throw error;
    return productId;
  }

  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Sign in before adding a product.');
  const { data, error } = await client.from('products').insert({ ...draft, created_by: user.id }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

/** Uploads a product photo to private storage and stores only the storage path in PostgreSQL. */
export async function uploadProductImage(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || !info.size) throw new Error('Choose an image that is available on this device.');
  if (info.size > 25 * 1024 * 1024) throw new Error('Maximum image size is 25 MB. Please select a smaller image.');

  const extension = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  const mimeType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  const bytes = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const response = await fetch(`data:${mimeType};base64,${bytes}`);
  const body = await response.arrayBuffer();
  const path = `${Crypto.randomUUID()}.${extension === 'png' || extension === 'webp' ? extension : 'jpg'}`;
  const { error } = await requireSupabase().storage.from('products').upload(path, body, { contentType: mimeType, upsert: false });
  if (error) throw error;
  const { data, error: urlError } = await requireSupabase().storage.from('products').createSignedUrl(path, 60 * 60);
  if (urlError) throw urlError;
  return { path, signedUrl: data.signedUrl };
}

/** Converts one private product path into a short-lived URL for display. */
export async function getProductImageUrl(path: string | null) {
  if (!path) return null;
  const { data, error } = await requireSupabase().storage.from('products').createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

/** Adds a product variant with its own SKU/barcode and optional price override. */
export async function addProductVariant(input: { productId: string; name: string; sku: string; barcode: string; salePrice: number | null; costPrice: number | null }) {
  const { error } = await requireSupabase().from('product_variants').insert({
    product_id: input.productId,
    name: input.name.trim(),
    sku: input.sku.trim(),
    barcode: input.barcode.trim() || null,
    sale_price: input.salePrice,
    cost_price: input.costPrice,
  });
  if (error) throw error;
}

/** Reads a branch's active warehouses for stock forms. */
export async function listWarehouses() {
  const { data, error } = await requireSupabase().from('warehouses').select('id, name, branch_id, is_primary').eq('is_active', true).order('name');
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, label: row.name, branch_id: row.branch_id, is_primary: row.is_primary }));
}

/** Reads active warehouses for the selected assigned branch. */
export async function listBranchWarehouses(branchId: string) {
  const { data, error } = await requireSupabase().from('warehouses')
    .select('id, name, branch_id, is_primary').eq('branch_id', branchId).eq('is_active', true).order('name');
  if (error) throw error;
  const locations = (data ?? []).map((row) => ({ id: row.id, label: row.name, branch_id: row.branch_id, is_primary: row.is_primary }));
  const db = await SQLite.openDatabaseAsync('sellora.db');
  await db.runAsync('DELETE FROM cached_warehouses WHERE branch_id=?', branchId);
  for (const location of locations) await db.runAsync('INSERT INTO cached_warehouses(branch_id,id,payload) VALUES(?,?,?)', branchId, location.id, await encryptLocalJson(location));
  return locations;
}

/** Loads the last warehouse list saved for this branch when POS is offline. */
export async function listCachedBranchWarehouses(branchId: string) {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const rows = await db.getAllAsync<{payload:string}>('SELECT payload FROM cached_warehouses WHERE branch_id=?', branchId);
  return Promise.all(rows.map((row) => decryptLocalJson<{id:string;label:string;branch_id:string;is_primary:boolean}>(row.payload)));
}

/** Combines products, variants and selected-warehouse stock into the items shown in POS. */
export async function listSellableItems(warehouseId: string): Promise<SellableProduct[]> {
  const client = requireSupabase();
  const [productResult, variantResult, stockResult] = await Promise.all([
    client.from('products').select('id, name, sku, barcode, category_id, brand_id, image_storage_path, cost_price, sale_price, tax_rate, minimum_stock, reorder_level').eq('is_active', true).order('name').limit(500),
    client.from('product_variants').select('id, product_id, name, sku, barcode, sale_price, cost_price').eq('is_active', true),
    client.from('inventory').select('product_id, variant_id, quantity').eq('warehouse_id', warehouseId),
  ]);
  if (productResult.error) throw productResult.error;
  if (variantResult.error) throw variantResult.error;
  if (stockResult.error) throw stockResult.error;

  const products = productResult.data ?? [];
  const variants = variantResult.data ?? [];
  const stock = new Map((stockResult.data ?? []).map((row) => [`${row.product_id}:${row.variant_id ?? 'base'}`, Number(row.quantity)]));
  const sellable: SellableProduct[] = [];
  for (const product of products) {
    const productVariants = variants.filter((variant) => variant.product_id === product.id);
    if (productVariants.length === 0) {
      sellable.push({
        productId: product.id, variantId: null, name: product.name, sku: product.sku, barcode: product.barcode,
        categoryId: product.category_id, brandId: product.brand_id,
        price: Number(product.sale_price), costPrice: Number(product.cost_price), taxRate: Number(product.tax_rate), minimumStock: Number(product.minimum_stock), reorderLevel: Number(product.reorder_level),
        imagePath: product.image_storage_path, quantityAvailable: stock.get(`${product.id}:base`) ?? 0,
      });
      continue;
    }
    for (const variant of productVariants) {
      sellable.push({
        productId: product.id, variantId: variant.id, name: `${product.name} · ${variant.name}`,
        sku: variant.sku, barcode: variant.barcode, price: Number(variant.sale_price ?? product.sale_price),
        categoryId: product.category_id, brandId: product.brand_id,
        costPrice: Number(variant.cost_price ?? product.cost_price), taxRate: Number(product.tax_rate),
        minimumStock: Number(product.minimum_stock), reorderLevel: Number(product.reorder_level),
        imagePath: product.image_storage_path, quantityAvailable: stock.get(`${product.id}:${variant.id}`) ?? 0,
      });
    }
  }
  await cacheSellableItems(warehouseId, sellable);
  return sellable;
}

/** Returns the last product and stock snapshot saved for POS offline browsing. */
export async function listCachedSellableItems(warehouseId: string): Promise<SellableProduct[]> {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const rows = await db.getAllAsync<{ payload: string }>('SELECT payload FROM cached_sellable_items WHERE warehouse_id = ? ORDER BY item_key', warehouseId);
  return Promise.all(rows.map((row) => decryptLocalJson<SellableProduct>(row.payload)));
}

/** Refreshes the local POS catalogue snapshot after a successful online load. */
async function cacheSellableItems(warehouseId: string, items: SellableProduct[]) {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM cached_sellable_items WHERE warehouse_id = ?', warehouseId);
    for (const item of items) {
      await db.runAsync('INSERT INTO cached_sellable_items (warehouse_id, item_key, payload, updated_at) VALUES (?, ?, ?, ?)',
        warehouseId, `${item.productId}:${item.variantId ?? 'base'}`, await encryptLocalJson(item), new Date().toISOString());
    }
  });
}

/** Lists parent products or their variant rows for purchase and transfer forms. */
export async function listPurchasableItems() {
  const client = requireSupabase();
  const [productResult, variantResult] = await Promise.all([
    client.from('products').select('id, name, sku, cost_price').eq('is_active', true).order('name'),
    client.from('product_variants').select('id, product_id, name, sku, cost_price').eq('is_active', true).order('name'),
  ]);
  if (productResult.error) throw productResult.error;
  if (variantResult.error) throw variantResult.error;
  const variants = variantResult.data ?? [];
  return (productResult.data ?? []).flatMap((product) => {
    const productVariants = variants.filter((variant) => variant.product_id === product.id);
    if (!productVariants.length) return [{ id: `${product.id}:base`, productId: product.id, variantId: null, label: `${product.name} · ${product.sku}`, unitCost: Number(product.cost_price) }];
    return productVariants.map((variant) => ({ id: `${product.id}:${variant.id}`, productId: product.id, variantId: variant.id, label: `${product.name} · ${variant.name} · ${variant.sku}`, unitCost: Number(variant.cost_price ?? product.cost_price) }));
  });
}

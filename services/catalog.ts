import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { decryptLocalJson, encryptLocalJson } from '@/services/localEncryption';
import * as FileSystem from 'expo-file-system/legacy';
import { requireDatabase } from '@/services/database';
import { getCurrentUser } from '@/services/auth';
import { getPrivateFileUrl, uploadPrivateFile } from '@/services/storage';
import { isOfflineWorkMode } from '@/services/connectivity';
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

export type CatalogProduct = ProductDraft & { id: string; is_active: boolean; updated_at?: string };
export type SimpleCatalogEntry = PickerOption & { description?: string; is_active?: boolean };
export type ProductVariant = { id: string; name: string; sku: string; barcode: string | null; sale_price: number | null; cost_price: number | null };
type ProductVariantDraft = { name: string; sku: string; barcode: string; salePrice: number | null; costPrice: number | null };
type OfflineVariantChange = { userId: string; productId: string; variantId: string; action: 'create' | 'update'; base: ProductVariant | null; draft: ProductVariantDraft };

async function cacheCatalogValue<T>(name: string, value: T) {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  await db.runAsync(
    'INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',
    `catalog:${name}`,
    await encryptLocalJson(value),
  );
}

async function readCatalogValue<T>(name: string): Promise<T | null> {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', `catalog:${name}`);
  return row ? decryptLocalJson<T>(row.value) : null;
}

async function cacheOneProduct(product: CatalogProduct) {
  const cached = await readCatalogValue<CatalogProduct[]>('products') ?? [];
  const index = cached.findIndex((row) => row.id === product.id);
  if (index >= 0) cached[index] = product;
  else cached.push(product);
  await cacheCatalogValue('products', cached);
}

/** Reads active categories for product and inventory filters. */
export async function listCategories() {
  try {
    const { data, error } = await requireDatabase().from('categories').select('id, name, description, is_active').eq('is_active', true).order('name');
    if (error) throw error;
    const rows = (data ?? []).map((row) => ({ id: row.id, label: row.name, description: row.description, is_active: row.is_active })) as SimpleCatalogEntry[];
    await cacheCatalogValue('categories', rows);
    return rows;
  } catch (error) {
    const cached = await readCatalogValue<SimpleCatalogEntry[]>('categories');
    if (cached) return cached;
    throw error;
  }
}

/** Reads active brands for product forms and filters. */
export async function listBrands() {
  try {
    const { data, error } = await requireDatabase().from('brands').select('id, name, description, is_active').eq('is_active', true).order('name');
    if (error) throw error;
    const rows = (data ?? []).map((row) => ({ id: row.id, label: row.name, description: row.description, is_active: row.is_active })) as SimpleCatalogEntry[];
    await cacheCatalogValue('brands', rows);
    return rows;
  } catch (error) {
    const cached = await readCatalogValue<SimpleCatalogEntry[]>('brands');
    if (cached) return cached;
    throw error;
  }
}

/** Loads products for the screen; search stays local so offline cached rows can be reused later. */
export async function listProducts() {
  try {
    const { data, error } = await requireDatabase()
      .from('products')
      .select('id, name, description, sku, barcode, category_id, brand_id, image_storage_path, unit, cost_price, sale_price, tax_rate, minimum_stock, reorder_level, expiry_enabled, batch_enabled, serial_enabled, is_active, updated_at')
      .eq('is_active', true)
      .order('name')
      .limit(1000);
    if (error) throw error;
    const products = (data ?? []) as CatalogProduct[];
    await cacheCatalogValue('products', products);
    return products;
  } catch (error) {
    const cached = await readCatalogValue<CatalogProduct[]>('products');
    if (cached) return cached;
    throw error;
  }
}

/** Loads one product for the edit screen. */
export async function getProduct(productId: string) {
  try {
    const { data, error } = await requireDatabase().from('products').select('*').eq('id', productId).single();
    if (error) throw error;
    return data as CatalogProduct;
  } catch (error) {
    const cached = await readCatalogValue<CatalogProduct[]>('products');
    const product = cached?.find((row) => row.id === productId);
    if (product) return product;
    throw error;
  }
}

/** Creates or edits a product and records which signed-in staff member created it. */
export async function saveProduct(draft: ProductDraft, productId?: string) {
  if (await isOfflineWorkMode()) return queueOfflineProduct(draft, productId);
  const client = requireDatabase();
  let savedDraft = draft;
  if (draft.image_storage_path?.startsWith('offline:')) {
    const uploaded = await uploadProductImage(draft.image_storage_path.slice('offline:'.length));
    savedDraft = { ...draft, image_storage_path: uploaded.path };
  }
  if (productId) {
    const updatedAt = new Date().toISOString();
    const { data, error } = await client.from('products').update({ ...savedDraft, updated_at: updatedAt })
      .eq('id', productId).select('id,updated_at').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Product not found or your access no longer allows this edit.');
    const previous = await readCatalogValue<CatalogProduct[]>('products');
    const previousProduct = previous?.find((row) => row.id === productId);
    if (previousProduct) await cacheOneProduct({ ...previousProduct, ...savedDraft, id: productId, is_active: true, updated_at: data.updated_at }).catch(() => {});
    return productId;
  }

  const user = await getCurrentUser();
  if (!user) throw new Error('Sign in before adding a product.');
  const { data, error } = await client.from('products').insert({ ...savedDraft, created_by: user.id }).select('id,updated_at').single();
  if (error) throw error;
  await cacheOneProduct({ ...savedDraft, id: data.id, is_active: true, updated_at: data.updated_at }).catch(() => {});
  return data.id as string;
}

type OfflineProductChange = {
  userId: string;
  productId: string;
  action: 'create' | 'update';
  baseUpdatedAt?: string;
  previousImagePath?: string | null;
  draft: ProductDraft;
};

/** Persists product edits locally so a cached catalogue can continue offline. */
async function queueOfflineProduct(draft: ProductDraft, productId?: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sign in on this device before saving products offline.');
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const id = productId ?? Crypto.randomUUID();
  let action: OfflineProductChange['action'] = productId ? 'update' : 'create';
  const cached = await readCatalogValue<CatalogProduct[]>('products') ?? [];
  const prior = cached.find((product) => product.id === id);
  const change: OfflineProductChange = {
    userId: user.id, productId: id, action, baseUpdatedAt: prior?.updated_at,
    previousImagePath: prior?.image_storage_path?.startsWith('offline:') ? null : prior?.image_storage_path,
    draft,
  };
  const pendingRows = action === 'update'
    ? await db.getAllAsync<{ id: string; payload: string }>("SELECT id,payload FROM sync_queue WHERE user_id=? AND entity='product' AND status IN ('pending','failed') ORDER BY created_at DESC", user.id)
    : [];
  let existingQueueId: string | null = null;
  for (const row of pendingRows) {
    const queued = await decryptLocalJson<OfflineProductChange>(row.payload);
    if (queued.productId === id) {
      existingQueueId = row.id;
      change.baseUpdatedAt = queued.baseUpdatedAt;
      change.previousImagePath = queued.previousImagePath;
      if (queued.action === 'create') action = 'create';
      change.action = action;
      break;
    }
  }
  const next: CatalogProduct = { ...prior, ...draft, id, is_active: true };
  const productIndex = cached.findIndex((product) => product.id === id);
  if (productIndex >= 0) cached[productIndex] = next;
  else cached.push(next);
  const queuedPayload = await encryptLocalJson(change);
  const cachedPayload = await encryptLocalJson(cached);
  await db.withTransactionAsync(async () => {
    if (existingQueueId) {
      await db.runAsync("UPDATE sync_queue SET action=?,payload=?,status='pending',last_error=NULL WHERE id=?", action, queuedPayload, existingQueueId);
    } else {
      await db.runAsync(
        'INSERT INTO sync_queue(id,entity,action,user_id,payload,status) VALUES(?,?,?,?,?,\'pending\')',
        Crypto.randomUUID(), 'product', action, user.id, queuedPayload,
      );
    }
    await db.runAsync(
      "INSERT INTO app_settings(key,value,updated_at) VALUES('catalog:products',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
      cachedPayload,
    );
  });
  return id;
}

/** Uploads queued product creates/edits in order after the user signs back in online. */
export async function syncOfflineProducts(userId: string) {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  await db.runAsync("UPDATE sync_queue SET status='pending' WHERE user_id=? AND entity='product' AND status='syncing'", userId);
  const rows = await db.getAllAsync<{ id: string; action: string; payload: string }>(
    "SELECT id,action,payload FROM sync_queue WHERE user_id=? AND entity='product' AND status IN ('pending','failed') ORDER BY created_at,id LIMIT 50",
    userId,
  );
  for (const row of rows) {
    let uploadedPath: string | null = null;
    let productCommitted = false;
    try {
      await db.runAsync("UPDATE sync_queue SET status='syncing',attempt_count=attempt_count+1,last_error=NULL WHERE id=?", row.id);
      const user = await getCurrentUser();
      if (!user || user.id !== userId) throw new Error('Sign in with the account that created these product changes.');
      const change = await decryptLocalJson<OfflineProductChange>(row.payload);
      let draft = change.draft;
      if (draft.image_storage_path?.startsWith('offline:')) {
        const uploaded = await uploadProductImage(draft.image_storage_path.slice('offline:'.length));
        draft = { ...draft, image_storage_path: uploaded.path };
        uploadedPath = uploaded.path;
      }
      const client = requireDatabase();
      let serverUpdatedAt: string | undefined;
      if (row.action === 'create') {
        const { error } = await client.from('products').upsert(
          { ...draft, id: change.productId, created_by: userId },
          { onConflict: 'id', ignoreDuplicates: true },
        );
        if (error) throw error;
        const { data, error: readError } = await client.from('products').select('updated_at').eq('id', change.productId).single();
        if (readError) throw readError;
        serverUpdatedAt = data.updated_at;
      } else {
        let update = client.from('products').update({ ...draft, updated_at: new Date().toISOString() }).eq('id', change.productId);
        if (change.baseUpdatedAt) update = update.eq('updated_at', change.baseUpdatedAt);
        const { data, error } = await update.select('id,updated_at').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('This product changed or was removed on another device. Review it online before retrying this offline edit.');
        serverUpdatedAt = data.updated_at;
      }
      productCommitted = true;
      if (change.previousImagePath && change.previousImagePath !== draft.image_storage_path
        && !change.previousImagePath.startsWith('offline:')) {
        await deletePrivateProductImage(change.previousImagePath).catch(() => {});
      }
      try {
        await db.runAsync("UPDATE sync_queue SET status='synced',last_error=NULL WHERE id=?", row.id);
        await db.runAsync("INSERT INTO app_settings(key,value,updated_at) VALUES('last_sync_at',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP", new Date().toISOString());
        const cached = await readCatalogValue<CatalogProduct[]>('products');
        const prior = cached?.find((product) => product.id === change.productId);
        await cacheOneProduct({ ...prior, ...draft, id: change.productId, is_active: true, updated_at: serverUpdatedAt });
      } catch {
        // The server accepted the change; keep the queue from reapplying it if
        // only local cache bookkeeping failed.
        await db.runAsync("UPDATE sync_queue SET status='synced',last_error=NULL WHERE id=?", row.id).catch(() => {});
      }
    } catch (error) {
      if (productCommitted) {
        await db.runAsync("UPDATE sync_queue SET status='synced',last_error=NULL WHERE id=?", row.id).catch(() => {});
        continue;
      }
      if (uploadedPath && !productCommitted) await deletePrivateProductImage(uploadedPath).catch(() => {});
      await db.runAsync("UPDATE sync_queue SET status='failed',attempt_count=attempt_count+1,last_error=? WHERE id=?", error instanceof Error ? error.message : 'Product sync failed', row.id);
    }
  }
}

async function deletePrivateProductImage(path: string) {
  const { deletePrivateFiles } = await import('@/services/storage');
  await deletePrivateFiles('products', [path]);
}

/** Keeps a selected product image in app storage until its queued product is uploaded. */
export async function stageOfflineProductImage(uri: string) {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('This device has no local file storage available.');
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || !info.size) throw new Error('Choose an image that is available on this device.');
  if (info.size > 25 * 1024 * 1024) throw new Error('Maximum image size is 25 MB. Please select a smaller image.');
  const extension = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  const suffix = extension === 'png' || extension === 'webp' ? extension : 'jpg';
  const directory = `${root}product-offline-images/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => {});
  const localUri = `${directory}${Crypto.randomUUID()}.${suffix}`;
  await FileSystem.copyAsync({ from: uri, to: localUri });
  return `offline:${localUri}`;
}

/** Uploads a product photo to private storage and stores only the storage path in PostgreSQL. */
export async function uploadProductImage(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || !info.size) throw new Error('Choose an image that is available on this device.');
  if (info.size > 25 * 1024 * 1024) throw new Error('Maximum image size is 25 MB. Please select a smaller image.');

  const extension = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  const mimeType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  const bytes = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const path = `${Crypto.randomUUID()}.${extension === 'png' || extension === 'webp' ? extension : 'jpg'}`;
  await uploadPrivateFile('products', path, bytes, mimeType);
  return { path };
}

/** Converts one private product path into a short-lived URL for display. */
export async function getProductImageUrl(path: string | null) {
  if (!path) return null;
  if (path.startsWith('offline:')) return path.slice('offline:'.length);
  const root = FileSystem.documentDirectory;
  const extension = path.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const localUri = root ? `${root}product-images/${encodeURIComponent(path)}.${extension}` : null;
  if (localUri && (await FileSystem.getInfoAsync(localUri)).exists) return localUri;
  let signedUrl: string;
  try {
    signedUrl = await getPrivateFileUrl('products', path);
    if (!localUri) return signedUrl;
    const directory = `${root}product-images/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => {});
    try {
      await FileSystem.downloadAsync(signedUrl, localUri);
      return localUri;
    } catch {
      return signedUrl;
    }
  } catch {
    if (localUri && (await FileSystem.getInfoAsync(localUri)).exists) return localUri;
    // A catalogue without an offline image can still be browsed and searched.
    return null;
  }
}

/** Adds a product variant with its own SKU/barcode and optional price override. */
export async function addProductVariant(input: { productId: string; name: string; sku: string; barcode: string; salePrice: number | null; costPrice: number | null }) {
  if (await isOfflineWorkMode()) {
    await queueOfflineVariant(input.productId, null, input);
    return;
  }
  const { error } = await requireDatabase().from('product_variants').insert({
    product_id: input.productId,
    name: input.name.trim(),
    sku: input.sku.trim(),
    barcode: input.barcode.trim() || null,
    sale_price: input.salePrice,
    cost_price: input.costPrice,
  });
  if (error) throw error;
}

/** Loads active variants and retains an encrypted local snapshot for offline viewing. */
export async function listProductVariants(productId: string): Promise<ProductVariant[]> {
  try {
    const { data, error } = await requireDatabase().from('product_variants')
      .select('id, name, sku, barcode, sale_price, cost_price').eq('product_id', productId).eq('is_active', true).order('name');
    if (error) throw error;
    const variants = (data ?? []) as ProductVariant[];
    await cacheCatalogValue(`variants:${productId}`, variants);
    return variants;
  } catch (error) {
    const cached = await readCatalogValue<ProductVariant[]>(`variants:${productId}`);
    if (cached) return cached;
    throw error;
  }
}

/** Updates a variant's identity and price overrides. */
export async function updateProductVariant(id: string, input: { name: string; sku: string; barcode: string; salePrice: number | null; costPrice: number | null }) {
  if (await isOfflineWorkMode()) {
    const productId = await getVariantProductId(id);
    const variants = await readCatalogValue<ProductVariant[]>(`variants:${productId}`);
    if (!variants?.some((variant) => variant.id === id)) throw new Error('Load this product’s variants online once before editing them offline.');
    await queueOfflineVariant(productId, id, input);
    return;
  }
  const { error } = await requireDatabase().from('product_variants').update({
    name: input.name.trim(), sku: input.sku.trim(), barcode: input.barcode.trim() || null,
    sale_price: input.salePrice, cost_price: input.costPrice,
  }).eq('id', id);
  if (error) throw error;
}

async function getVariantProductId(variantId: string) {
  const cached = await SQLite.openDatabaseAsync('sellora.db');
  const rows = await cached.getAllAsync<{ key: string; value: string }>("SELECT key,value FROM app_settings WHERE key LIKE 'catalog:variants:%'");
  for (const row of rows) {
    const productId = row.key.slice('catalog:variants:'.length);
    const variants = await decryptLocalJson<ProductVariant[]>(row.value);
    if (variants.some((variant) => variant.id === variantId)) return productId;
  }
  throw new Error('Load this product’s variants online once before editing them offline.');
}

async function queueOfflineVariant(productId: string, variantId: string | null, input: ProductVariantDraft) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sign in on this device before saving variants offline.');
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const cached = await readCatalogValue<ProductVariant[]>(`variants:${productId}`);
  if (!cached) throw new Error('Load this product’s variants online once before changing them offline.');
  const id = variantId ?? Crypto.randomUUID();
  const previous = cached.find((variant) => variant.id === id) ?? null;
  if (variantId && !previous) throw new Error('This variant is not in the saved catalogue. Reconnect and refresh it first.');
  let action: OfflineVariantChange['action'] = previous ? 'update' : 'create';
  const pending = action === 'update'
    ? await db.getAllAsync<{ id: string; payload: string }>("SELECT id,payload FROM sync_queue WHERE user_id=? AND entity='variant' AND status IN ('pending','failed') ORDER BY created_at DESC", user.id)
    : [];
  let existingQueueId: string | null = null;
  let base = previous;
  for (const row of pending) {
    const queued = await decryptLocalJson<OfflineVariantChange>(row.payload);
    if (queued.variantId !== id) continue;
    existingQueueId = row.id;
    base = queued.base;
    if (queued.action === 'create') action = 'create';
    break;
  }
  const next = { id, name: input.name.trim(), sku: input.sku.trim(), barcode: input.barcode.trim() || null, sale_price: input.salePrice, cost_price: input.costPrice };
  const nextVariants = [...cached.filter((variant) => variant.id !== id), next].sort((left, right) => left.name.localeCompare(right.name));
  const payload = await encryptLocalJson({ userId: user.id, productId, variantId: id, action, base, draft: input } satisfies OfflineVariantChange);
  const cachedPayload = await encryptLocalJson(nextVariants);
  await db.withTransactionAsync(async () => {
    if (existingQueueId) {
      await db.runAsync("UPDATE sync_queue SET action=?,payload=?,status='pending',last_error=NULL WHERE id=?", action, payload, existingQueueId);
    } else {
      await db.runAsync("INSERT INTO sync_queue(id,entity,action,user_id,payload,status) VALUES(?, 'variant', ?, ?, ?, 'pending')", Crypto.randomUUID(), action, user.id, payload);
    }
    await db.runAsync("INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP", `catalog:variants:${productId}`, cachedPayload);
  });
}

/** Replays queued variants after product changes; rejects edits changed by another device. */
export async function syncOfflineVariants(userId: string) {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  await db.runAsync("UPDATE sync_queue SET status='pending' WHERE user_id=? AND entity='variant' AND status='syncing'", userId);
  const rows = await db.getAllAsync<{ id: string; action: string; payload: string }>("SELECT id,action,payload FROM sync_queue WHERE user_id=? AND entity='variant' AND status IN ('pending','failed') ORDER BY created_at,id LIMIT 50", userId);
  const client = requireDatabase();
  for (const row of rows) {
    await db.runAsync("UPDATE sync_queue SET status='syncing',attempt_count=attempt_count+1,last_error=NULL WHERE id=?", row.id);
    try {
      const user = await getCurrentUser();
      if (!user || user.id !== userId) throw new Error('Sign in with the account that created these variant changes.');
      const change = await decryptLocalJson<OfflineVariantChange>(row.payload);
      const { data: current, error: readError } = await client.from('product_variants')
        .select('id,product_id,name,sku,barcode,sale_price,cost_price,is_active').eq('id', change.variantId).maybeSingle();
      if (readError) throw readError;
      const desired = { name: change.draft.name.trim(), sku: change.draft.sku.trim(), barcode: change.draft.barcode.trim() || null, sale_price: change.draft.salePrice, cost_price: change.draft.costPrice };
      if (row.action === 'create') {
        if (current) {
          const same = (['name', 'sku', 'barcode', 'sale_price', 'cost_price'] as const).every((key) => sameVariantValue(current[key], desired[key]));
          if (current.product_id !== change.productId || !same) throw new Error('A conflicting variant already exists. Review this change online before retrying.');
        } else {
          const { error } = await client.from('product_variants').insert({ id: change.variantId, product_id: change.productId, ...desired });
          if (error) throw error;
        }
      } else {
        if (!current || current.product_id !== change.productId || !current.is_active) throw new Error('This variant was removed or archived on another device. Review it online before retrying.');
        const fields = ['name', 'sku', 'barcode', 'sale_price', 'cost_price'] as const;
        const sameDesired = fields.every((key) => sameVariantValue(current[key], desired[key]));
        if (!sameDesired) {
          const base = change.base;
          const unchanged = Boolean(base && fields.every((key) => sameVariantValue(current[key], base[key])));
          if (!unchanged) throw new Error('This variant changed on another device. Review it online before retrying this edit.');
          const { data, error } = await client.from('product_variants').update(desired).eq('id', change.variantId).select('id').maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('Your access to this variant changed. Review it online before retrying.');
        }
      }
      await db.runAsync("UPDATE sync_queue SET status='synced',last_error=NULL WHERE id=?", row.id);
      await refreshCachedVariantForOfflinePos(change, {
        name: desired.name, sku: desired.sku, barcode: desired.barcode ?? '',
        salePrice: desired.sale_price, costPrice: desired.cost_price,
      }).catch(() => {});
      await db.runAsync("INSERT INTO app_settings(key,value,updated_at) VALUES('last_sync_at',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP", new Date().toISOString());
    } catch (error) {
      await db.runAsync("UPDATE sync_queue SET status='failed',attempt_count=attempt_count+1,last_error=? WHERE id=?", error instanceof Error ? error.message : 'Variant sync failed', row.id);
    }
  }
}

function sameVariantValue(left: unknown, right: unknown) {
  if (left == null || right == null) return left == null && right == null;
  if (typeof left === 'number' || typeof right === 'number') return Number(left) === Number(right);
  return left === right;
}

/** Updates the cached POS snapshot only after the server accepted a variant change. */
async function refreshCachedVariantForOfflinePos(change: OfflineVariantChange, draft: ProductVariantDraft) {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const products = await readCatalogValue<CatalogProduct[]>('products') ?? [];
  const product = products.find((row) => row.id === change.productId);
  const rows = await db.getAllAsync<{ warehouse_id: string; item_key: string; payload: string }>(
    'SELECT warehouse_id,item_key,payload FROM cached_sellable_items WHERE item_key LIKE ?', `${change.productId}:%`,
  );
  const byWarehouse = new Map<string, SellableProduct[]>();
  for (const row of rows) {
    const values = byWarehouse.get(row.warehouse_id) ?? [];
    values.push(await decryptLocalJson<SellableProduct>(row.payload));
    byWarehouse.set(row.warehouse_id, values);
  }
  for (const [warehouseId, values] of byWarehouse) {
    const existing = values.find((item) => item.variantId === change.variantId);
    const parent = existing ?? values.find((item) => item.variantId === null) ?? values[0];
    if (!parent) continue;
    const next: SellableProduct = {
      ...parent,
      productId: change.productId,
      variantId: change.variantId,
      name: `${product?.name ?? parent.name.replace(/ · .*$/, '')} · ${draft.name.trim()}`,
      sku: draft.sku.trim(),
      barcode: draft.barcode.trim() || null,
      price: Number(draft.salePrice ?? product?.sale_price ?? parent.price),
      costPrice: Number(draft.costPrice ?? product?.cost_price ?? parent.costPrice),
      quantityAvailable: existing?.quantityAvailable ?? 0,
    };
    const nextValues = values.filter((item) => item.variantId !== null || change.action !== 'create');
    const index = nextValues.findIndex((item) => item.variantId === change.variantId);
    if (index >= 0) nextValues[index] = next;
    else nextValues.push(next);
    await cacheSellableItems(warehouseId, nextValues);
  }
}

/** Hides a discontinued variant without breaking historic sale references. */
export async function deactivateProductVariant(id: string) {
  const productId = await getVariantProductId(id).catch(() => null);
  const { error } = await requireDatabase().from('product_variants')
    .update({ is_active: false }).eq('id', id);
  if (error) throw error;
  if (productId) await removeVariantFromCachedPos(productId, id).catch(() => {});
}

async function removeVariantFromCachedPos(productId: string, variantId: string) {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  await db.runAsync('DELETE FROM cached_sellable_items WHERE item_key=?', `${productId}:${variantId}`);
}

/** Reads a branch's active warehouses for stock forms. */
export async function listWarehouses() {
  const { data, error } = await requireDatabase().from('warehouses').select('id, name, branch_id, is_primary').eq('is_active', true).order('name');
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, label: row.name, branch_id: row.branch_id, is_primary: row.is_primary }));
}

/** Reads active warehouses for the selected assigned branch. */
export async function listBranchWarehouses(branchId: string) {
  const { data, error } = await requireDatabase().from('warehouses')
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
  const client = requireDatabase();
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
  const client = requireDatabase();
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

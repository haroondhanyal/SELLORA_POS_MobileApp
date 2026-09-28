import { requireDatabase } from '@/services/database';
import { getCurrentUser } from '@/services/auth';
import { deletePrivateFiles, getPrivateFileUrl, uploadPrivateFile } from '@/services/storage';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { encryptLocalJson, decryptLocalJson } from '@/services/localEncryption';
import { isOfflineWorkMode } from '@/services/connectivity';
import { stageOfflineProductImage } from '@/services/catalog';

export type Supplier = { id: string; branch_id: string; name: string; company_name: string | null; phone: string | null; email: string | null; address: string | null; is_active: boolean };
export type ExpenseRow = { id: string; category: string; description: string; amount: number; payment_method: string; receipt_storage_path: string | null; created_at: string };
export type StockTransfer = { id: string; transfer_number: string; from_branch_id: string; to_branch_id: string; from_warehouse_id: string; to_warehouse_id: string; status: string; note: string; created_at: string };
export type PurchaseOrder = { id: string; order_number: string; branch_id: string; warehouse_id: string; supplier_id: string; status: string; total_cost: number; note: string; created_at: string };
export type PurchaseOrderItem = { id: string; product_id: string; variant_id: string | null; ordered_quantity: number; received_quantity: number; unit_cost: number; products?: { name: string; sku: string } | null };

/** Sale line snapshots shown when a cashier processes a return. */
export type ReturnableSaleItem = { id: string; product_name: string; sku: string; quantity: number; unit_price: number; line_total: number; returned_quantity: number };

/** Looks up a sale by receipt and adds already-returned quantities to each item. */
export async function getReturnableSale(receiptNumber: string) {
  const client = requireDatabase();
  const { data: sale, error } = await client.from('sales').select('id,receipt_number,branch_id,status,customer_id,created_at').eq('receipt_number', receiptNumber.trim()).single();
  if (error) throw error;
  const { data: items, error: itemsError } = await client.from('sale_items').select('id,product_name,sku,quantity,unit_price,line_total').eq('sale_id', sale.id);
  if (itemsError) throw itemsError;
  const { data: returns, error: returnsError } = await client.from('sales_return_items').select('sale_item_id,quantity,sales_returns!inner(sale_id)').eq('sales_returns.sale_id', sale.id);
  if (returnsError) throw returnsError;
  const returned = new Map<string, number>();
  for (const row of returns ?? []) returned.set(row.sale_item_id, (returned.get(row.sale_item_id) ?? 0) + Number(row.quantity));
  return { sale, items: (items ?? []).map((item) => ({ ...item, returned_quantity: returned.get(item.id) ?? 0 })) as ReturnableSaleItem[] };
}

/** Records a refund and restores inventory through one permission-checked transaction. */
export async function processSaleReturn(input: { saleId: string; items: { sale_item_id: string; quantity: number }[]; reason: string; refundMethod: string }) {
  const { data, error } = await requireDatabase().rpc('sellora_process_return', {
    p_sale_id: input.saleId, p_items: input.items, p_reason: input.reason, p_refund_method: input.refundMethod,
  });
  if (error) throw error;
  return data as string;
}

/** Reads recent branch refunds for the return history screen. */
export async function listSalesReturns(branchId: string) {
  const { data, error } = await requireDatabase().from('sales_returns')
    .select('id,return_number,sale_id,reason,refund_method,refund_total,created_at,sales(receipt_number)')
    .eq('branch_id', branchId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
}

/** Records a branch expense. Database permissions enforce branch and author access. */
export async function createExpense(input: { branchId: string; category: string; description: string; amount: number; method: string; receiptUri?: string | null }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sign in before recording an expense.');
  const id = Crypto.randomUUID();
  if (await isOfflineWorkMode()) {
    const receiptUri = input.receiptUri ? await stageOfflineProductImage(input.receiptUri) : null;
    const row: ExpenseRow = { id, category: input.category, description: input.description.trim(), amount: input.amount, payment_method: input.method, receipt_storage_path: receiptUri, created_at: new Date().toISOString() };
    const db = await SQLite.openDatabaseAsync('sellora.db');
    const key = `expenses:${user.id}:${input.branchId}`;
    const cached = await db.getFirstAsync<{value:string}>('SELECT value FROM app_settings WHERE key=?', key);
    const rows = cached ? await decryptLocalJson<typeof row[]>(cached.value) : [];
    const nextRows = [row, ...rows.filter((item) => item.id !== id)].slice(0, 500);
    await db.withTransactionAsync(async () => {
      await db.runAsync("INSERT INTO sync_queue(id,entity,action,user_id,payload,status) VALUES(?, 'expense', 'create', ?, ?, 'pending')", Crypto.randomUUID(), user.id, await encryptLocalJson({ ...input, id, receiptUri, userId: user.id }));
      await db.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP', key, await encryptLocalJson(nextRows));
    });
    return id;
  }
  const client = requireDatabase();
  let receiptPath:string|null=null;
  try{
    if(input.receiptUri) receiptPath=await uploadExpenseReceipt(input.branchId,input.receiptUri,id);
    const { error } = await client.from('expenses').insert({
      id,
      branch_id: input.branchId, category: input.category, description: input.description.trim(),
      amount: input.amount, payment_method: input.method, receipt_storage_path:receiptPath, created_by: user.id,
    });
    if (error) throw error;
  }catch(error){
    if(receiptPath) await deletePrivateFiles('expenses', [receiptPath]);
    throw error;
  }
}

/** Validates and uploads an expense receipt to the branch-private storage bucket. */
async function uploadExpenseReceipt(branchId:string,uri:string,expenseId:string){
  const info=await FileSystem.getInfoAsync(uri);
  if(!info.exists||!info.size)throw new Error('Choose an image available on this device.');
  if(info.size>25*1024*1024)throw new Error('Maximum image size is 25 MB. Please select a smaller image.');
  const extension=uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  const mimeType=extension==='png'?'image/png':extension==='webp'?'image/webp':'image/jpeg';
  const base64=await FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64});
  const path=`${branchId}/${expenseId}.${extension==='png'||extension==='webp'?extension:'jpg'}`;
  await uploadPrivateFile('expenses', path, base64, mimeType);
  return path;
}

/** Creates a short-lived URL for a receipt image in the private expenses bucket. */
export async function getExpenseReceiptUrl(path:string|null){
  if(!path)return null;
  if(path.startsWith('offline:'))return path.slice('offline:'.length);
  return getPrivateFileUrl('expenses', path);
}

/** Lists recent expenses in a branch visible to the current role. */
export async function listExpenses(branchId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sign in before loading expenses.');
  const key = `expenses:${user.id}:${branchId}`;
  try {
    const { data, error } = await requireDatabase().from('expenses')
      .select('id,category,description,amount,payment_method,receipt_storage_path,created_at').eq('branch_id', branchId)
      .order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    const rows = data ?? [];
    const db = await SQLite.openDatabaseAsync('sellora.db');
    await db.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP', key, await encryptLocalJson(rows));
    return rows;
  } catch (error) {
    const db = await SQLite.openDatabaseAsync('sellora.db');
    const cached = await db.getFirstAsync<{value:string}>('SELECT value FROM app_settings WHERE key=?', key);
    if (cached) return decryptLocalJson<ExpenseRow[]>(cached.value);
    throw error;
  }
}

/** Syncs encrypted expense entries after reconnecting, keeping receipt paths stable across retries. */
export async function syncOfflineExpenses(userId: string) {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  await db.runAsync("UPDATE sync_queue SET status='pending' WHERE user_id=? AND entity='expense' AND status='syncing'", userId);
  const rows = await db.getAllAsync<{id:string;payload:string}>("SELECT id,payload FROM sync_queue WHERE user_id=? AND entity='expense' AND status IN ('pending','failed') ORDER BY created_at,id LIMIT 50", userId);
  const client = requireDatabase();
  for (const queued of rows) {
    await db.runAsync("UPDATE sync_queue SET status='syncing',attempt_count=attempt_count+1,last_error=NULL WHERE id=?", queued.id);
    try {
      const user = await getCurrentUser();
      if (!user || user.id !== userId) throw new Error('Sign in with the account that created this expense.');
      const change = await decryptLocalJson<{id:string;userId:string;branchId:string;category:string;description:string;amount:number;method:string;receiptUri:string|null}>(queued.payload);
      let {data: saved, error} = await client.from('expenses').select('id,category,description,amount,payment_method,receipt_storage_path,created_at').eq('id',change.id).maybeSingle();
      if (error) throw error;
      if (!saved) {
        const receiptPath = change.receiptUri?.startsWith('offline:')
          ? await uploadExpenseReceipt(change.branchId, change.receiptUri.slice('offline:'.length), change.id)
          : null;
        const result = await client.from('expenses').insert({
          id:change.id, branch_id:change.branchId, category:change.category, description:change.description.trim(),
          amount:change.amount, payment_method:change.method, receipt_storage_path:receiptPath, created_by:userId,
        }).select('id,category,description,amount,payment_method,receipt_storage_path,created_at').single();
        if (result.error) throw result.error;
        saved = result.data;
      }
      const cacheKey = `expenses:${userId}:${change.branchId}`;
      const existing = await db.getFirstAsync<{value:string}>('SELECT value FROM app_settings WHERE key=?',cacheKey);
      if (existing) {
        const values = await decryptLocalJson<ExpenseRow[]>(existing.value);
        await db.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',cacheKey,await encryptLocalJson([saved,...values.filter((item)=>item.id!==saved.id)].slice(0,500)));
      }
      if (change.receiptUri?.startsWith('offline:')) await FileSystem.deleteAsync(change.receiptUri.slice('offline:'.length), { idempotent: true }).catch(() => {});
      await db.runAsync("UPDATE sync_queue SET status='synced',last_error=NULL WHERE id=?",queued.id);
    } catch(error) {
      await db.runAsync("UPDATE sync_queue SET status='failed',attempt_count=attempt_count+1,last_error=? WHERE id=?",error instanceof Error?error.message:'Expense sync failed',queued.id);
    }
  }
}

/** Reads suppliers available in one assigned branch. */
export async function listSuppliers(branchId: string) {
  const user = await getCurrentUser();
  const key = user ? `suppliers:${user.id}:${branchId}` : '';
  const db = await SQLite.openDatabaseAsync('sellora.db');
  async function readCached() {
    if (!key) return null;
    const cached = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', key);
    return cached ? decryptLocalJson<Supplier[]>(cached.value) : null;
  }
  if (await isOfflineWorkMode()) {
    const cached = await readCached();
    if (cached) return cached;
    throw new Error('No supplier list is saved for this branch. Connect to Sellora once and retry.');
  }
  try {
    const { data, error } = await requireDatabase().from('suppliers').select('id, branch_id, name, company_name, phone, email, address, is_active').eq('branch_id', branchId).eq('is_active', true).order('name');
    if (error) throw error;
    const rows = (data ?? []) as Supplier[];
    if (key) await db.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP', key, await encryptLocalJson(rows));
    return rows;
  } catch (error) {
    const cached = await readCached();
    if (cached) return cached;
    throw error;
  }
}

/** Creates a supplier in the selected branch. */
export async function createSupplier(input: { branchId: string; name: string; companyName: string; phone: string; email: string; address: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sign in before adding a supplier.');
  const { error } = await requireDatabase().from('suppliers').insert({
    branch_id: input.branchId,
    name: input.name.trim(),
    company_name: input.companyName.trim() || null,
    phone: input.phone.trim() || null,
    email: input.email.trim().toLowerCase() || null,
    address: input.address.trim() || null,
    created_by: user.id,
  });
  if (error) throw error;
}

/** Creates a stock-transfer request through the permission-checked database function. */
export async function createStockTransfer(input: { fromWarehouse: string; toWarehouse: string; items: { product_id: string; variant_id: string | null; quantity: number }[]; note: string }) {
  const { data, error } = await requireDatabase().rpc('sellora_create_stock_transfer', {
    p_from_warehouse: input.fromWarehouse,
    p_to_warehouse: input.toWarehouse,
    p_items: input.items,
    p_note: input.note,
  });
  if (error) throw error;
  return data as string;
}

/** Lists transfers visible to either assigned side of each transfer. */
export async function listStockTransfers() {
  const { data, error } = await requireDatabase().from('stock_transfers')
    .select('id, transfer_number, from_branch_id, to_branch_id, from_warehouse_id, to_warehouse_id, status, note, created_at')
    .order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as StockTransfer[];
}

/** Moves a transfer to the next allowed status; inventory changes happen in PostgreSQL. */
export async function updateStockTransfer(transferId: string, status: string) {
  const { error } = await requireDatabase().rpc('sellora_update_stock_transfer', { p_transfer_id: transferId, p_next_status: status });
  if (error) throw error;
}

/** Creates a purchase order and stores each product/cost snapshot together. */
export async function createPurchaseOrder(input: { branchId: string; warehouseId: string; supplierId: string; items: { product_id: string; variant_id: string | null; quantity: number; unit_cost: number }[]; note: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sign in before creating a purchase order.');
  const id = Crypto.randomUUID();
  const payload = { ...input, id, userId: user.id };
  if (await isOfflineWorkMode()) {
    const db = await SQLite.openDatabaseAsync('sellora.db');
    const cacheKey = `purchase_orders:${user.id}:${input.branchId}`;
    const cached = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', cacheKey);
    const previous = cached ? await decryptLocalJson<PurchaseOrder[]>(cached.value) : [];
    const draft: PurchaseOrder = {
      id, order_number: `LOCAL-${id.slice(0, 8).toUpperCase()}`, branch_id: input.branchId,
      warehouse_id: input.warehouseId, supplier_id: input.supplierId, status: 'pending_sync',
      total_cost: input.items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0),
      note: input.note.trim(), created_at: new Date().toISOString(),
    };
    await db.withTransactionAsync(async () => {
      await db.runAsync("INSERT INTO sync_queue(id,entity,action,user_id,payload,status) VALUES(?, 'purchase_order', 'create', ?, ?, 'pending')", id, user.id, await encryptLocalJson(payload));
      await db.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP', cacheKey, await encryptLocalJson([draft, ...previous.filter((order) => order.id !== id)].slice(0, 200)));
    });
    return id;
  }
  const { data, error } = await requireDatabase().rpc('sellora_create_purchase_order', {
    p_branch_id: input.branchId, p_warehouse_id: input.warehouseId, p_supplier_id: input.supplierId,
    p_items: input.items, p_note: input.note,
  });
  if (error) throw error;
  return data as string;
}

/** Lists branch purchase orders for receiving and status review. */
export async function listPurchaseOrders(branchId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Sign in before loading purchase orders.');
  const cacheKey = `purchase_orders:${user.id}:${branchId}`;
  const db = await SQLite.openDatabaseAsync('sellora.db');
  async function readCached() {
    const cached = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', cacheKey);
    return cached ? decryptLocalJson<PurchaseOrder[]>(cached.value) : [];
  }
  if (await isOfflineWorkMode()) return readCached();
  try {
    const { data, error } = await requireDatabase().from('purchase_orders')
      .select('id, order_number, branch_id, warehouse_id, supplier_id, status, total_cost, note, created_at')
      .eq('branch_id', branchId).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    const rows = (data ?? []) as PurchaseOrder[];
    const queued = await readCached();
    const merged = [...queued.filter((order) => order.status === 'pending_sync' && !rows.some((saved) => saved.id === order.id)), ...rows].slice(0, 200);
    await db.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP', cacheKey, await encryptLocalJson(merged));
    return merged;
  } catch (error) {
    const cached = await readCached();
    if (cached.length) return cached;
    throw error;
  }
}

/** Replays locally queued purchase orders; the database validates permissions and stock references idempotently. */
export async function syncOfflinePurchaseOrders(userId: string) {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  await db.runAsync("UPDATE sync_queue SET status='pending' WHERE user_id=? AND entity='purchase_order' AND status='syncing'", userId);
  const rows = await db.getAllAsync<{ id: string; payload: string }>("SELECT id,payload FROM sync_queue WHERE user_id=? AND entity='purchase_order' AND status IN ('pending','failed') ORDER BY created_at,id LIMIT 50", userId);
  const client = requireDatabase();
  for (const row of rows) {
    await db.runAsync("UPDATE sync_queue SET status='syncing',attempt_count=attempt_count+1,last_error=NULL WHERE id=?", row.id);
    try {
      const user = await getCurrentUser();
      if (!user || user.id !== userId) throw new Error('Sign in with the account that created this purchase order.');
      const payload = await decryptLocalJson<{ id: string; userId: string; branchId: string; warehouseId: string; supplierId: string; items: { product_id: string; variant_id: string | null; quantity: number; unit_cost: number }[]; note: string }>(row.payload);
      if (payload.userId !== userId || payload.id !== row.id) throw new Error('This queued purchase order does not match the signed-in account.');
      const { error } = await client.rpc('sellora_create_purchase_order_with_id', {
        p_client_order_id: payload.id, p_branch_id: payload.branchId, p_warehouse_id: payload.warehouseId,
        p_supplier_id: payload.supplierId, p_items: payload.items, p_note: payload.note,
      });
      if (error) throw error;
      const { data, error: fetchError } = await client.from('purchase_orders')
        .select('id, order_number, branch_id, warehouse_id, supplier_id, status, total_cost, note, created_at')
        .eq('id', payload.id).single();
      if (fetchError) throw fetchError;
      const cacheKey = `purchase_orders:${userId}:${payload.branchId}`;
      const saved = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', cacheKey);
      const previous = saved ? await decryptLocalJson<PurchaseOrder[]>(saved.value) : [];
      await db.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP', cacheKey, await encryptLocalJson([data as PurchaseOrder, ...previous.filter((order) => order.id !== payload.id)].slice(0, 200)));
      await db.runAsync("UPDATE sync_queue SET status='synced',last_error=NULL WHERE id=?", row.id);
    } catch (error) {
      await db.runAsync("UPDATE sync_queue SET status='failed',last_error=? WHERE id=?", error instanceof Error ? error.message : 'Purchase-order sync failed', row.id);
    }
  }
}

/** Loads remaining purchase quantities for the GRN screen. */
export async function getPurchaseOrderItems(orderId: string) {
  const { data, error } = await requireDatabase().from('purchase_order_items')
    .select('id, product_id, variant_id, ordered_quantity, received_quantity, unit_cost, products(name, sku)')
    .eq('purchase_order_id', orderId);
  if (error) throw error;
  return (data ?? []) as unknown as PurchaseOrderItem[];
}

/** Creates one goods-received note and updates the order's remaining quantities. */
export async function receivePurchase(orderId: string, items: { item_id: string; quantity: number }[], note: string) {
  const { data, error } = await requireDatabase().rpc('sellora_receive_purchase', {
    p_order_id: orderId,
    p_items: items,
    p_note: note,
  });
  if (error) throw error;
  return data as string;
}

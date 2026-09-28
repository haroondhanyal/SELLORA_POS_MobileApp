import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import type { CartLine } from '@/providers/CartProvider';
import { getDeviceId } from '@/services/device';
import { apiRequest } from '@/services/api';
import { getCurrentUser } from '@/services/auth';
import { decryptLocalJson, encryptLocalJson } from '@/services/localEncryption';
import type { Customer } from '@/services/customers';

export type OfflineSalePayload = {
  id: string; userId: string; branchId: string; warehouseId: string; customerId: string | null; salesAgentId: string;
  items: CartLine[]; payments: { method: string; amount: number; reference?: string }[];
  subtotal: number; discountTotal: number; taxTotal: number; total: number; currency: string;
};

/** Persists an offline receipt and reduces only the local cached stock snapshot. */
export async function saveOfflineSale(input: Omit<OfflineSalePayload, 'id' | 'userId'> & { userId: string }) {
  if (input.items.length === 0) throw new Error('Add at least one item.');
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const payload: OfflineSalePayload = { ...input, id: Crypto.randomUUID() };
  await db.withTransactionAsync(async () => {
    const creditDue = payload.payments.filter((payment) => payment.method === 'customer_credit').reduce((sum, payment) => sum + payment.amount, 0);
    const storeCreditDue = payload.payments.filter((payment) => payment.method === 'store_credit').reduce((sum, payment) => sum + payment.amount, 0);
    if (creditDue > 0 || storeCreditDue > 0) {
      if (!payload.customerId) throw new Error('Choose a customer before using customer or store credit.');
      const customerRow = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM cached_customers WHERE branch_id=? AND id=?', payload.branchId, payload.customerId);
      if (!customerRow) throw new Error('Refresh this customer online before using credit offline.');
      const customer = await decryptLocalJson<Customer>(customerRow.payload);
      if (Number(customer.credit_balance) + creditDue > Number(customer.credit_limit)) throw new Error('Cached customer credit limit would be exceeded.');
      if (storeCreditDue > Number(customer.store_credit_balance)) throw new Error('Cached store credit balance is too low.');
      customer.credit_balance = Number(customer.credit_balance) + creditDue;
      customer.store_credit_balance = Number(customer.store_credit_balance) - storeCreditDue;
      await db.runAsync('UPDATE cached_customers SET payload=?,updated_at=? WHERE branch_id=? AND id=?', await encryptLocalJson(customer), new Date().toISOString(), payload.branchId, payload.customerId);
    }
    for (const item of payload.items) {
      const key = `${item.productId}:${item.variantId ?? 'base'}`;
      const row = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM cached_sellable_items WHERE warehouse_id=? AND item_key=?', payload.warehouseId, key);
      if (!row) throw new Error(`No offline stock snapshot exists for ${item.name}. Connect online and refresh products first.`);
      const cached = await decryptLocalJson<CartLine>(row.payload);
      if (cached.quantityAvailable < item.quantity) throw new Error(`Offline stock is too low for ${item.name}.`);
      cached.quantityAvailable -= item.quantity;
      await db.runAsync('UPDATE cached_sellable_items SET payload=?,updated_at=? WHERE warehouse_id=? AND item_key=?', await encryptLocalJson(cached), new Date().toISOString(), payload.warehouseId, key);
    }
    await db.runAsync('INSERT INTO offline_sales (id,user_id,payload,status) VALUES (?,?,?,?)', payload.id, payload.userId, await encryptLocalJson(payload), 'pending');
  });
  return payload.id;
}

/** Retries queued sales using a server idempotency key and records permanent errors for review. */
export async function syncOfflineSales(userId: string) {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  await db.runAsync("UPDATE offline_sales SET status='pending' WHERE user_id=? AND status='syncing'",userId);
  const queued = await db.getAllAsync<{ id: string; payload: string; attempt_count: number }>("SELECT id,payload,attempt_count FROM offline_sales WHERE user_id=? AND status IN ('pending','failed') ORDER BY created_at LIMIT 20", userId);
  let syncedAny = false;
  for (const row of queued) {
    const sale = await decryptLocalJson<OfflineSalePayload>(row.payload);
    await db.runAsync("UPDATE offline_sales SET status='syncing',attempt_count=attempt_count+1,last_error=NULL WHERE id=?", row.id);
    try {
      const user = await getCurrentUser();
      if (!user || user.id !== sale.userId) throw new Error('Sign in with the account that created this offline sale.');
      const deviceId = await getDeviceId();
      const { saleId } = await apiRequest<{ saleId: string }>('/api/sales/offline-sync', {
        method: 'POST', body: JSON.stringify({ clientSaleId: sale.id, branchId: sale.branchId, warehouseId: sale.warehouseId,
          customerId: sale.customerId, salesAgentId: sale.salesAgentId, deviceId,
          items: sale.items.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, discountAmount: item.discountAmount })),
          payments: sale.payments }),
      });
      await db.runAsync("UPDATE offline_sales SET status='synced',server_sale_id=?,synced_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=?", saleId, row.id);
      syncedAny = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown sync error';
      await db.runAsync("UPDATE offline_sales SET status='failed',last_error=? WHERE id=?", message, row.id);
    }
  }
  if (syncedAny) await db.runAsync("INSERT INTO app_settings(key,value,updated_at) VALUES('last_sync_at',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP", new Date().toISOString());
}

/** Lists recent local receipts and sync state for the offline management screen. */
export async function listOfflineSales(userId: string) {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const rows = await db.getAllAsync<{ id: string; user_id: string; payload: string; status: string; attempt_count: number; last_error: string | null; server_sale_id: string | null; created_at: string; synced_at: string | null }>('SELECT id,user_id,payload,status,attempt_count,last_error,server_sale_id,created_at,synced_at FROM offline_sales WHERE user_id=? ORDER BY created_at DESC LIMIT 100', userId);
  return Promise.all(rows.map(async(row)=>({...row,payload:await decryptLocalJson<OfflineSalePayload>(row.payload)})));
}

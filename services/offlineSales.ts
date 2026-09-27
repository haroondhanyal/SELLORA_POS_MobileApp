import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import type { CartLine } from '@/providers/CartProvider';
import { getDeviceId } from '@/services/device';
import { requireSupabase } from '@/services/supabase';

export type OfflineSalePayload = {
  id: string; userId: string; branchId: string; warehouseId: string; customerId: string | null; salesAgentId: string;
  items: CartLine[]; payments: { method: string; amount: number; reference?: string }[];
  subtotal: number; discountTotal: number; taxTotal: number; total: number; currency: string;
};

/** Persists an offline receipt and reduces only the local cached stock snapshot. */
export async function saveOfflineSale(input: Omit<OfflineSalePayload, 'id' | 'userId'> & { userId: string }) {
  if (input.items.length === 0) throw new Error('Add at least one item.');
  if (input.payments.some((payment) => ['customer_credit', 'store_credit'].includes(payment.method))) {
    throw new Error('Customer credit and store credit require an online connection.');
  }
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const payload: OfflineSalePayload = { ...input, id: Crypto.randomUUID() };
  await db.withTransactionAsync(async () => {
    for (const item of payload.items) {
      const key = `${item.productId}:${item.variantId ?? 'base'}`;
      const row = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM cached_sellable_items WHERE warehouse_id=? AND item_key=?', payload.warehouseId, key);
      if (!row) throw new Error(`No offline stock snapshot exists for ${item.name}. Connect online and refresh products first.`);
      const cached = JSON.parse(row.payload) as CartLine;
      if (cached.quantityAvailable < item.quantity) throw new Error(`Offline stock is too low for ${item.name}.`);
      cached.quantityAvailable -= item.quantity;
      await db.runAsync('UPDATE cached_sellable_items SET payload=?,updated_at=? WHERE warehouse_id=? AND item_key=?', JSON.stringify(cached), new Date().toISOString(), payload.warehouseId, key);
    }
    await db.runAsync('INSERT INTO offline_sales (id,user_id,payload,status) VALUES (?,?,?,?)', payload.id, payload.userId, JSON.stringify(payload), 'pending');
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
    const sale = JSON.parse(row.payload) as OfflineSalePayload;
    await db.runAsync("UPDATE offline_sales SET status='syncing',attempt_count=attempt_count+1,last_error=NULL WHERE id=?", row.id);
    try {
      const { data: { user } } = await requireSupabase().auth.getUser();
      if (!user || user.id !== sale.userId) throw new Error('Sign in with the account that created this offline sale.');
      const deviceId = await getDeviceId();
      const { data, error } = await requireSupabase().rpc('sellora_sync_offline_sale', {
        p_client_sale_id: sale.id, p_branch_id: sale.branchId, p_warehouse_id: sale.warehouseId,
        p_customer_id: sale.customerId, p_agent_id: sale.salesAgentId, p_device_id: deviceId,
        p_items: sale.items.map((item) => ({ product_id: item.productId, variant_id: item.variantId, quantity: item.quantity, discount_amount: item.discountAmount })),
        p_payments: sale.payments,
      });
      if (error) throw error;
      await db.runAsync("UPDATE offline_sales SET status='synced',server_sale_id=?,synced_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=?", String(data), row.id);
      syncedAny = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown sync error';
      await db.runAsync("UPDATE offline_sales SET status='failed',last_error=? WHERE id=?", message, row.id);
    }
  }
  if (syncedAny) await db.runAsync("INSERT INTO app_settings(key,value,updated_at) VALUES('last_sync_at',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP", new Date().toISOString());
}

/** Lists recent local receipts and sync state for the offline management screen. */
export async function listOfflineSales() {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  return db.getAllAsync<{ id: string; user_id: string; payload: string; status: string; attempt_count: number; last_error: string | null; server_sale_id: string | null; created_at: string; synced_at: string | null }>('SELECT id,user_id,payload,status,attempt_count,last_error,server_sale_id,created_at,synced_at FROM offline_sales ORDER BY created_at DESC LIMIT 100');
}

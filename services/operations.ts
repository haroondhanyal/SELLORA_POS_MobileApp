import { requireSupabase } from '@/services/supabase';

export type Supplier = { id: string; branch_id: string; name: string; company_name: string | null; phone: string | null; email: string | null; address: string | null; is_active: boolean };
export type StockTransfer = { id: string; transfer_number: string; from_branch_id: string; to_branch_id: string; from_warehouse_id: string; to_warehouse_id: string; status: string; note: string; created_at: string };
export type PurchaseOrder = { id: string; order_number: string; branch_id: string; warehouse_id: string; supplier_id: string; status: string; total_cost: number; note: string; created_at: string };
export type PurchaseOrderItem = { id: string; product_id: string; variant_id: string | null; ordered_quantity: number; received_quantity: number; unit_cost: number; products?: { name: string; sku: string } | null };

/** Reads suppliers available in one assigned branch. */
export async function listSuppliers(branchId: string) {
  const { data, error } = await requireSupabase().from('suppliers').select('id, branch_id, name, company_name, phone, email, address, is_active').eq('branch_id', branchId).eq('is_active', true).order('name');
  if (error) throw error;
  return (data ?? []) as Supplier[];
}

/** Creates a supplier in the selected branch. */
export async function createSupplier(input: { branchId: string; name: string; companyName: string; phone: string; email: string; address: string }) {
  const { data: { user } } = await requireSupabase().auth.getUser();
  if (!user) throw new Error('Sign in before adding a supplier.');
  const { error } = await requireSupabase().from('suppliers').insert({
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
  const { data, error } = await requireSupabase().rpc('sellora_create_stock_transfer', {
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
  const { data, error } = await requireSupabase().from('stock_transfers')
    .select('id, transfer_number, from_branch_id, to_branch_id, from_warehouse_id, to_warehouse_id, status, note, created_at')
    .order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as StockTransfer[];
}

/** Moves a transfer to the next allowed status; inventory changes happen in PostgreSQL. */
export async function updateStockTransfer(transferId: string, status: string) {
  const { error } = await requireSupabase().rpc('sellora_update_stock_transfer', { p_transfer_id: transferId, p_next_status: status });
  if (error) throw error;
}

/** Creates a purchase order and stores each product/cost snapshot together. */
export async function createPurchaseOrder(input: { branchId: string; warehouseId: string; supplierId: string; items: { product_id: string; variant_id: string | null; quantity: number; unit_cost: number }[]; note: string }) {
  const { data, error } = await requireSupabase().rpc('sellora_create_purchase_order', {
    p_branch_id: input.branchId,
    p_warehouse_id: input.warehouseId,
    p_supplier_id: input.supplierId,
    p_items: input.items,
    p_note: input.note,
  });
  if (error) throw error;
  return data as string;
}

/** Lists branch purchase orders for receiving and status review. */
export async function listPurchaseOrders(branchId: string) {
  const { data, error } = await requireSupabase().from('purchase_orders')
    .select('id, order_number, branch_id, warehouse_id, supplier_id, status, total_cost, note, created_at')
    .eq('branch_id', branchId).order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as PurchaseOrder[];
}

/** Loads remaining purchase quantities for the GRN screen. */
export async function getPurchaseOrderItems(orderId: string) {
  const { data, error } = await requireSupabase().from('purchase_order_items')
    .select('id, product_id, variant_id, ordered_quantity, received_quantity, unit_cost, products(name, sku)')
    .eq('purchase_order_id', orderId);
  if (error) throw error;
  return (data ?? []) as unknown as PurchaseOrderItem[];
}

/** Creates one goods-received note and updates the order's remaining quantities. */
export async function receivePurchase(orderId: string, items: { item_id: string; quantity: number }[], note: string) {
  const { data, error } = await requireSupabase().rpc('sellora_receive_purchase', {
    p_order_id: orderId,
    p_items: items,
    p_note: note,
  });
  if (error) throw error;
  return data as string;
}

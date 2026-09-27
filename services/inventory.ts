import { requireSupabase } from '@/services/supabase';

export type InventoryRow = {
  id: string;
  warehouse_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  products: { name: string; sku: string; sale_price: number; minimum_stock: number; reorder_level: number; image_storage_path: string | null } | null;
  product_variants: { name: string; sku: string } | null;
  warehouses: { name: string; branch_id: string } | null;
};

/** Loads only stock rows visible to the signed-in user's assigned branches. */
export async function listInventory() {
  const { data, error } = await requireSupabase().from('inventory')
    .select('id, warehouse_id, product_id, variant_id, quantity, products(name, sku, sale_price, minimum_stock, reorder_level, image_storage_path), product_variants(name, sku), warehouses(name, branch_id)')
    .order('updated_at', { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as InventoryRow[];
}

/** Makes an atomic stock change through the permission-checked database function. */
export async function adjustStock(input: { warehouseId: string; productId: string; variantId: string | null; quantityDelta: number; reason: string }) {
  const { data, error } = await requireSupabase().rpc('sellora_adjust_stock', {
    p_warehouse_id: input.warehouseId,
    p_product_id: input.productId,
    p_variant_id: input.variantId,
    p_quantity_delta: input.quantityDelta,
    p_reason: input.reason.trim(),
  });
  if (error) throw error;
  return data as string;
}

/** Reads stock adjustment history for all branches visible to the current account. */
export async function listStockAdjustments() {
  const { data, error } = await requireSupabase().from('stock_adjustments')
    .select('id, quantity_delta, reason, created_at, products(name, sku), product_variants(name, sku), warehouses(name, branch_id)')
    .order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as {
    id: string; quantity_delta: number; reason: string; created_at: string;
    products: { name: string; sku: string } | null;
    product_variants: { name: string; sku: string } | null;
    warehouses: { name: string; branch_id: string } | null;
  }[];
}

import { requireDatabase } from '@/services/database';
import * as SQLite from 'expo-sqlite';
import type { SellableProduct } from '@/providers/CartProvider';
import { decryptLocalJson, encryptLocalJson } from '@/services/localEncryption';

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
  const { data, error } = await requireDatabase().from('inventory')
    .select('id, warehouse_id, product_id, variant_id, quantity, products(name, sku, sale_price, minimum_stock, reorder_level, image_storage_path), product_variants(name, sku), warehouses(name, branch_id)')
    .order('updated_at', { ascending: false }).limit(500);
  if (error) throw error;
  const rows=(data ?? []) as unknown as InventoryRow[];
  const db=await SQLite.openDatabaseAsync('sellora.db');
  for(const row of rows){
    if(!row.products||!row.warehouses)continue;
    const cached:SellableProduct={productId:row.product_id,variantId:row.variant_id,name:row.product_variants?`${row.products.name} · ${row.product_variants.name}`:row.products.name,
      sku:row.product_variants?.sku??row.products.sku,barcode:null,categoryId:null,brandId:null,price:Number(row.products.sale_price),costPrice:0,taxRate:0,
      imagePath:row.products.image_storage_path,quantityAvailable:Number(row.quantity),minimumStock:Number(row.products.minimum_stock),reorderLevel:Number(row.products.reorder_level)};
    await db.runAsync('INSERT INTO cached_sellable_items(warehouse_id,item_key,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(warehouse_id,item_key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',row.warehouse_id,`${row.product_id}:${row.variant_id??'base'}`,await encryptLocalJson(cached),new Date().toISOString());
    const warehouse={id:row.warehouse_id,label:row.warehouses.name,branch_id:row.warehouses.branch_id,is_primary:false};
    await db.runAsync('INSERT INTO cached_warehouses(branch_id,id,payload) VALUES(?,?,?) ON CONFLICT(branch_id,id) DO UPDATE SET payload=excluded.payload',row.warehouses.branch_id,row.warehouse_id,await encryptLocalJson(warehouse));
  }
  return rows;
}

/** Builds an inventory view from POS snapshots saved by an earlier online session. */
export async function listCachedInventory(branchId:string) {
  const db=await SQLite.openDatabaseAsync('sellora.db');
  const warehouses=await db.getAllAsync<{id:string;payload:string}>('SELECT id,payload FROM cached_warehouses WHERE branch_id=?',branchId);
  const result:InventoryRow[]=[];
  for(const warehouse of warehouses){
    const location=await decryptLocalJson<{name?:string;label?:string}>(warehouse.payload);
    const items=await db.getAllAsync<{item_key:string;payload:string}>('SELECT item_key,payload FROM cached_sellable_items WHERE warehouse_id=?',warehouse.id);
    for(const cachedRow of items){
      const item=await decryptLocalJson<SellableProduct>(cachedRow.payload);
      const [productId,variantId]=cachedRow.item_key.split(':');
      result.push({id:`${warehouse.id}:${cachedRow.item_key}`,warehouse_id:warehouse.id,product_id:productId,variant_id:variantId==='base'?null:variantId,
        quantity:item.quantityAvailable,products:{name:item.name.split(' · ')[0],sku:item.sku,sale_price:item.price,minimum_stock:item.minimumStock??0,reorder_level:item.reorderLevel??0,image_storage_path:item.imagePath},
        product_variants:item.variantId?{name:item.name.split(' · ').slice(1).join(' · '),sku:item.sku}:null,warehouses:{name:location.name??location.label??'Warehouse',branch_id:branchId}});
    }
  }
  return result;
}

/** Makes an atomic stock change through the permission-checked database function. */
export async function adjustStock(input: { warehouseId: string; productId: string; variantId: string | null; quantityDelta: number; reason: string }) {
  const { data, error } = await requireDatabase().rpc('sellora_adjust_stock', {
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
  const { data, error } = await requireDatabase().from('stock_adjustments')
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

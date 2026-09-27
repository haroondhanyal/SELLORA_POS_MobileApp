import { requireSupabase } from '@/services/supabase';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

export type Supplier = { id: string; branch_id: string; name: string; company_name: string | null; phone: string | null; email: string | null; address: string | null; is_active: boolean };
export type StockTransfer = { id: string; transfer_number: string; from_branch_id: string; to_branch_id: string; from_warehouse_id: string; to_warehouse_id: string; status: string; note: string; created_at: string };
export type PurchaseOrder = { id: string; order_number: string; branch_id: string; warehouse_id: string; supplier_id: string; status: string; total_cost: number; note: string; created_at: string };
export type PurchaseOrderItem = { id: string; product_id: string; variant_id: string | null; ordered_quantity: number; received_quantity: number; unit_cost: number; products?: { name: string; sku: string } | null };

/** Sale line snapshots shown when a cashier processes a return. */
export type ReturnableSaleItem = { id: string; product_name: string; sku: string; quantity: number; unit_price: number; line_total: number; returned_quantity: number };

/** Looks up a sale by receipt and adds already-returned quantities to each item. */
export async function getReturnableSale(receiptNumber: string) {
  const client = requireSupabase();
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
  const { data, error } = await requireSupabase().rpc('sellora_process_return', {
    p_sale_id: input.saleId, p_items: input.items, p_reason: input.reason, p_refund_method: input.refundMethod,
  });
  if (error) throw error;
  return data as string;
}

/** Reads recent branch refunds for the return history screen. */
export async function listSalesReturns(branchId: string) {
  const { data, error } = await requireSupabase().from('sales_returns')
    .select('id,return_number,sale_id,reason,refund_method,refund_total,created_at,sales(receipt_number)')
    .eq('branch_id', branchId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
}

/** Records a branch expense. Database permissions enforce branch and author access. */
export async function createExpense(input: { branchId: string; category: string; description: string; amount: number; method: string; receiptUri?: string | null }) {
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Sign in before recording an expense.');
  let receiptPath:string|null=null;
  try{
    if(input.receiptUri) receiptPath=await uploadExpenseReceipt(input.branchId,input.receiptUri);
    const { error } = await client.from('expenses').insert({
      branch_id: input.branchId, category: input.category, description: input.description.trim(),
      amount: input.amount, payment_method: input.method, receipt_storage_path:receiptPath, created_by: user.id,
    });
    if (error) throw error;
  }catch(error){
    if(receiptPath) await client.storage.from('expenses').remove([receiptPath]);
    throw error;
  }
}

/** Validates and uploads an expense receipt to the branch-private storage bucket. */
async function uploadExpenseReceipt(branchId:string,uri:string){
  const info=await FileSystem.getInfoAsync(uri);
  if(!info.exists||!info.size)throw new Error('Choose an image available on this device.');
  if(info.size>25*1024*1024)throw new Error('Maximum image size is 25 MB. Please select a smaller image.');
  const extension=uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  const mimeType=extension==='png'?'image/png':extension==='webp'?'image/webp':'image/jpeg';
  const base64=await FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64});
  const body=await(await fetch(`data:${mimeType};base64,${base64}`)).arrayBuffer();
  const path=`${branchId}/${Crypto.randomUUID()}.${extension==='png'||extension==='webp'?extension:'jpg'}`;
  const {error}=await requireSupabase().storage.from('expenses').upload(path,body,{contentType:mimeType,upsert:false});
  if(error)throw error;
  return path;
}

/** Creates a short-lived URL for a receipt image in the private expenses bucket. */
export async function getExpenseReceiptUrl(path:string|null){
  if(!path)return null;
  const {data,error}=await requireSupabase().storage.from('expenses').createSignedUrl(path,60*60);
  if(error)throw error;
  return data.signedUrl;
}

/** Lists recent expenses in a branch visible to the current role. */
export async function listExpenses(branchId: string) {
  const { data, error } = await requireSupabase().from('expenses')
    .select('id,category,description,amount,payment_method,receipt_storage_path,created_at').eq('branch_id', branchId)
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
}

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

import { requireSupabase } from '@/services/supabase';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

export type Customer = {
  id: string;
  branch_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  date_of_birth: string | null;
  avatar_storage_path: string | null;
  credit_limit: number;
  credit_balance: number;
  store_credit_balance: number;
  loyalty_points: number;
  assigned_sales_agent_id: string | null;
};

/** Lists branch customers allowed by the database row-level policy. */
export async function listCustomers(branchId: string) {
  const { data, error } = await requireSupabase().from('customers')
    .select('id, branch_id, full_name, phone, email, address, date_of_birth, avatar_storage_path, credit_limit, credit_balance, store_credit_balance, loyalty_points, assigned_sales_agent_id')
    .eq('branch_id', branchId).order('full_name').limit(500);
  if (error) throw error;
  return (data ?? []) as Customer[];
}

/** Creates a customer in the current user's primary branch. */
export async function createCustomer(input: {
  branch_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  date_of_birth: string | null;
  credit_limit: number;
  assigned_sales_agent_id: string | null;
  photoUri: string | null;
}) {
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error('Sign in before adding a customer.');
  const customerId = Crypto.randomUUID();
  let photoPath: string | null = null;
  try {
    if (input.photoUri) photoPath = await uploadCustomerPhoto(input.branch_id, customerId, input.photoUri);
    const { error } = await client.from('customers').insert({
      id: customerId,
      branch_id: input.branch_id,
      full_name: input.full_name.trim(),
      phone: input.phone,
      email: input.email,
      address: input.address,
      date_of_birth: input.date_of_birth,
      avatar_storage_path: photoPath,
      credit_limit: input.credit_limit,
      assigned_sales_agent_id: input.assigned_sales_agent_id,
      created_by: user.id,
    });
    if (error) throw error;
    return customerId;
  } catch (error) {
    if (photoPath) await client.storage.from('customers').remove([photoPath]);
    throw error;
  }
}

/** Uploads one validated customer photo into its branch-private storage folder. */
async function uploadCustomerPhoto(branchId: string, customerId: string, uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || !info.size) throw new Error('Choose an image available on this device.');
  if (info.size > 25 * 1024 * 1024) throw new Error('Maximum image size is 25 MB. Please select a smaller image.');
  const extension = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  const mimeType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const body = await (await fetch(`data:${mimeType};base64,${base64}`)).arrayBuffer();
  const path = `${branchId}/${customerId}/${Crypto.randomUUID()}.${extension === 'png' || extension === 'webp' ? extension : 'jpg'}`;
  const { error } = await requireSupabase().storage.from('customers').upload(path, body, { contentType: mimeType, upsert: false });
  if (error) throw error;
  return path;
}

/** Creates a short-lived URL for a private branch customer photo. */
export async function getCustomerPhotoUrl(path: string | null) {
  if (!path) return null;
  const { data, error } = await requireSupabase().storage.from('customers').createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

/** Fetches sales agents that are approved and assigned to the active branch. */
export async function listBranchSalesAgents(branchId: string) {
  const { data, error } = await requireSupabase().rpc('sellora_list_branch_sales_agents', { target_branch: branchId });
  if (error) throw error;
  return (data ?? []) as { id: string; full_name: string }[];
}

/** Posts a payment against one customer's outstanding balance. */
export async function receiveCustomerCreditPayment(input: { customerId: string; amount: number; method: string; reference: string }) {
  const { data, error } = await requireSupabase().rpc('sellora_receive_customer_payment', {
    p_customer_id: input.customerId, p_amount: input.amount, p_method: input.method, p_reference: input.reference,
  });
  if (error) throw error;
  return data as string;
}

/** Reads one transaction with its immutable line, payment and base-currency snapshots. */
export async function getSaleReceipt(saleId: string) {
  const client = requireSupabase();
  const [saleResult, itemsResult, paymentResult] = await Promise.all([
    client.from('sales').select('id, receipt_number, branch_id, warehouse_id, customer_id, currency_code, base_currency, subtotal, discount_total, tax_total, total, created_at').eq('id', saleId).single(),
    client.from('sale_items').select('product_name, sku, quantity, unit_price, discount_amount, tax_amount, line_total').eq('sale_id', saleId),
    client.from('payments').select('method, amount, reference').eq('sale_id', saleId),
  ]);
  if (saleResult.error) throw saleResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (paymentResult.error) throw paymentResult.error;
  return { sale: saleResult.data, items: itemsResult.data ?? [], payments: paymentResult.data ?? [] };
}

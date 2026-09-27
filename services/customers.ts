import { requireSupabase } from '@/services/supabase';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { decryptLocalJson, encryptLocalJson } from '@/services/localEncryption';

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
  const customers = (data ?? []) as Customer[];
  const db = await SQLite.openDatabaseAsync('sellora.db');
  for (const customer of customers) {
    await db.runAsync('INSERT INTO cached_customers(branch_id,id,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(branch_id,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at', branchId, customer.id, await encryptLocalJson(customer), new Date().toISOString());
  }
  return customers;
}

/** Reads branch customers last cached online for an offline POS lookup. */
export async function listCachedCustomers(branchId: string) {
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const rows = await db.getAllAsync<{payload:string}>('SELECT payload FROM cached_customers WHERE branch_id=?', branchId);
  const customers = await Promise.all(rows.map((row) => decryptLocalJson<Customer>(row.payload)));
  return customers.sort((left,right)=>left.full_name.localeCompare(right.full_name));
}

/** Saves a customer on-device and queues it for insert before dependent offline sales sync. */
export async function queueOfflineCustomer(input: {
  branch_id: string; full_name: string; phone: string | null; email: string | null; address: string | null;
  date_of_birth: string | null; credit_limit: number; assigned_sales_agent_id: string | null; userId:string;
}) {
  if (!input.userId) throw new Error('Sign in before adding a customer.');
  const db = await SQLite.openDatabaseAsync('sellora.db');
  const customer: Customer = {
    id: Crypto.randomUUID(), branch_id: input.branch_id, full_name: input.full_name.trim(), phone: input.phone,
    email: input.email, address: input.address, date_of_birth: input.date_of_birth, avatar_storage_path: null,
    credit_limit: input.credit_limit, credit_balance: 0, store_credit_balance: 0, loyalty_points: 0,
    assigned_sales_agent_id: input.assigned_sales_agent_id,
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO cached_customers(branch_id,id,payload) VALUES(?,?,?)', customer.branch_id, customer.id, await encryptLocalJson(customer));
    await db.runAsync('INSERT INTO offline_customers(id,user_id,branch_id,payload,status) VALUES(?,?,?,?,\'pending\')', customer.id, input.userId, customer.branch_id, await encryptLocalJson({ ...customer, created_by: input.userId }));
  });
  return customer.id;
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
  const agents = (data ?? []) as { id: string; full_name: string }[];
  const db = await SQLite.openDatabaseAsync('sellora.db');
  for (const agent of agents) await db.runAsync('INSERT INTO cached_sales_agents(branch_id,id,full_name) VALUES(?,?,?) ON CONFLICT(branch_id,id) DO UPDATE SET full_name=excluded.full_name', branchId, agent.id, await encryptLocalJson(agent.full_name));
  return agents;
}

/** Reads sales agents cached by an online POS session in the same branch. */
export async function listCachedBranchSalesAgents(branchId:string) {
  const db=await SQLite.openDatabaseAsync('sellora.db');
  const rows=await db.getAllAsync<{id:string;full_name:string}>('SELECT id,full_name FROM cached_sales_agents WHERE branch_id=? ORDER BY id',branchId);
  return Promise.all(rows.map(async(row)=>({...row,full_name:await decryptLocalJson<string>(row.full_name)})));
}

/** Uploads local customer records idempotently before their queued sale is uploaded. */
export async function syncOfflineCustomers(userId:string) {
  const db=await SQLite.openDatabaseAsync('sellora.db');
  await db.runAsync("UPDATE offline_customers SET status='pending' WHERE user_id=? AND status='syncing'",userId);
  const rows=await db.getAllAsync<{id:string;branch_id:string;payload:string}>('SELECT id,branch_id,payload FROM offline_customers WHERE user_id=? AND status IN (\'pending\',\'failed\') ORDER BY created_at',userId);
  for(const row of rows){
    try{
      await db.runAsync("UPDATE offline_customers SET status='syncing',last_error=NULL WHERE id=?",row.id);
      const customer=await decryptLocalJson<Customer & {created_by:string}>(row.payload);
      const {data:{user}}=await requireSupabase().auth.getUser();
      if(!user||user.id!==userId) throw new Error('Sign in with the account that created this customer.');
      const {error}=await requireSupabase().from('customers').upsert({
        id:customer.id,branch_id:customer.branch_id,full_name:customer.full_name,phone:customer.phone,email:customer.email,
        address:customer.address,date_of_birth:customer.date_of_birth,credit_limit:customer.credit_limit,
        assigned_sales_agent_id:customer.assigned_sales_agent_id,created_by:customer.created_by,
      },{onConflict:'id',ignoreDuplicates:true});
      if(error) throw error;
      await db.runAsync("UPDATE offline_customers SET status='synced',synced_at=CURRENT_TIMESTAMP WHERE id=?",row.id);
    }catch(error){
      await db.runAsync("UPDATE offline_customers SET status='failed',last_error=? WHERE id=?",error instanceof Error?error.message:'Customer sync failed',row.id);
    }
  }
}

/** Lists local customer queue state for diagnostics and retry visibility. */
export async function listOfflineCustomers(userId:string) {
  const db=await SQLite.openDatabaseAsync('sellora.db');
  const rows=await db.getAllAsync<{id:string;payload:string;status:string;last_error:string|null;created_at:string}>('SELECT id,payload,status,last_error,created_at FROM offline_customers WHERE user_id=? ORDER BY created_at DESC LIMIT 100',userId);
  return Promise.all(rows.map(async(row)=>({...row,payload:await decryptLocalJson<Customer>(row.payload)})));
}

/** Posts a payment against one customer's outstanding balance. */
export async function receiveCustomerCreditPayment(input: { customerId: string; amount: number; method: string; reference: string }) {
  const { data, error } = await requireSupabase().rpc('sellora_receive_customer_payment', {
    p_customer_id: input.customerId, p_amount: input.amount, p_method: input.method, p_reference: input.reference,
  });
  if (error) throw error;
  return data as string;
}

/** Converts whole hundreds of loyalty points into customer store credit. */
export async function redeemCustomerLoyalty(customerId:string,points:number){
  const {data,error}=await requireSupabase().rpc('sellora_redeem_loyalty',{p_customer_id:customerId,p_points:points});
  if(error)throw error;
  return Number(data);
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

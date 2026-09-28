import { requireDatabase } from '@/services/database';
import { getCurrentUser } from '@/services/auth';

/** Reads pending approval items available to the signed-in review role. */
export async function listApprovals() {
  const { data, error } = await requireDatabase().from('approvals').select('id,branch_id,requester_id,request_type,title,details,status,created_at,profiles!approvals_requester_id_fkey(full_name)').order('created_at',{ascending:false}).limit(200);
  if(error) throw error;
  return data ?? [];
}

/** Saves a simple approval request; the reviewer still decides in the approval module. */
export async function requestApproval(input:{branchId:string|null;type:string;title:string;details:string}) {
  const user=await getCurrentUser(); if(!user) throw new Error('Sign in first.');
  const {error}=await requireDatabase().from('approvals').insert({branch_id:input.branchId,requester_id:user.id,request_type:input.type,title:input.title.trim(),details:input.details.trim()});
  if(error) throw error;
}

/** Applies an approval decision and notifies the original requester atomically. */
export async function reviewApproval(id:string,status:'approved'|'rejected',note:string) {
  const {error}=await requireDatabase().rpc('sellora_review_approval',{p_id:id,p_status:status,p_note:note}); if(error) throw error;
}

/** Lists personal notifications newest first. */
export async function listNotifications() {
  const {data,error}=await requireDatabase().from('notifications').select('id,category,title,body,read_at,created_at').order('created_at',{ascending:false}).limit(100);
  if(error) throw error; return data??[];
}

/** Marks one personal notification as read. */
export async function markNotificationRead(id:string) {
  const {error}=await requireDatabase().from('notifications').update({read_at:new Date().toISOString()}).eq('id',id); if(error) throw error;
}

/** Loads branch sales for a date range; PostgreSQL RLS determines visible rows. */
export async function getSalesReport(branchId:string,start:string) {
  const {data,error}=await requireDatabase().from('sales').select('id,total,subtotal,discount_total,tax_total,status,created_at,sales_agent_id,profiles!sales_sales_agent_id_fkey(full_name)').eq('branch_id',branchId).gte('created_at',start).order('created_at',{ascending:false}).limit(5000);
  if(error) throw error; return data??[];
}

/** Reads recent audit events that the database permits this user to inspect. */
export async function listAuditEvents(branchId:string) {
  const {data,error}=await requireDatabase().from('audit_logs').select('id,action,entity,summary,created_at,profiles!audit_logs_actor_id_fkey(full_name)').eq('branch_id',branchId).order('created_at',{ascending:false}).limit(100);
  if(error) throw error; return data??[];
}

/** Loads financial and sales breakdown source rows for branch reports. */
export async function getDetailedReport(branchId:string,start:string){
  const client=requireDatabase();
  const [sales,items,expenses,returns,commissions]=await Promise.all([
    client.from('sales').select('id,total,discount_total,status,created_at,sales_agent_id,cashier_id,customer_id,profiles!sales_sales_agent_id_fkey(full_name),cashier:profiles!sales_cashier_id_fkey(full_name),customers(full_name)')
      .eq('branch_id',branchId).gte('created_at',start).limit(5000),
    client.from('sale_items').select('product_name,product_id,quantity,unit_cost,line_total,tax_amount,discount_amount,sales!inner(branch_id,created_at,status),products(category_id,categories(name))')
      .eq('sales.branch_id',branchId).gte('sales.created_at',start).limit(10000),
    client.from('expenses').select('amount,category,created_at').eq('branch_id',branchId).gte('created_at',start).limit(5000),
    client.from('sales_returns').select('refund_total,created_at').eq('branch_id',branchId).gte('created_at',start).limit(5000),
    client.from('agent_commissions').select('commission_amount,created_at').eq('branch_id',branchId).gte('created_at',start).limit(5000),
  ]);
  for(const result of [sales,items,expenses,returns,commissions])if(result.error)throw result.error;
  return {sales:sales.data??[],items:items.data??[],expenses:expenses.data??[],returns:returns.data??[],commissions:commissions.data??[]};
}

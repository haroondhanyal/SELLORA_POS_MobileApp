import { requireDatabase } from '@/services/database';

/** Reads the signed-in user's latest shift for their branch. */
export async function getMyOpenShift(userId: string) {
  const { data, error } = await requireDatabase().from('employee_shifts').select('id,branch_id,opened_at,opening_cash').eq('user_id', userId).is('closed_at', null).maybeSingle();
  if (error) throw error;
  return data;
}

/** Starts an employee shift and opening drawer balance. */
export async function openShift(branchId: string, openingCash: number) {
  const { data, error } = await requireDatabase().rpc('sellora_open_shift', { p_branch_id: branchId, p_opening_cash: openingCash });
  if (error) throw error;
  return data as string;
}

/** Closes a shift and asks PostgreSQL to calculate expected cash and variance. */
export async function closeShift(shiftId: string, actualCash: number, note: string) {
  const { error } = await requireDatabase().rpc('sellora_close_shift', { p_shift_id: shiftId, p_actual_cash: actualCash, p_note: note });
  if (error) throw error;
}

/** Records a documented manual cash-in or cash-out against an open employee shift. */
export async function recordCashDrawerEntry(input:{shiftId:string;type:'cash_in'|'cash_out';amount:number;reason:string}){
  const {error}=await requireDatabase().rpc('sellora_record_cash_drawer_entry',{p_shift_id:input.shiftId,p_type:input.type,p_amount:input.amount,p_reason:input.reason});
  if(error)throw error;
}

/** Lists the cash movements entered manually during one shift. */
export async function listCashDrawerEntries(shiftId:string){
  const {data,error}=await requireDatabase().from('cash_drawer_entries').select('id,entry_type,amount,reason,created_at').eq('shift_id',shiftId).order('created_at');
  if(error)throw error;
  return data??[];
}

/** Lists sales agents and their latest assigned targets. */
export async function listBranchTargets(branchId: string) {
  const { data, error } = await requireDatabase().from('sales_targets')
    .select('id,agent_id,period_type,period_start,target_amount,profiles!sales_targets_agent_id_fkey(full_name)')
    .eq('branch_id', branchId).order('period_start', { ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
}

/** Assigns or updates an agent target through a branch permission-checked function. */
export async function saveSalesTarget(input: { branchId: string; agentId: string; periodType: string; periodStart: string; amount: number }) {
  const { error } = await requireDatabase().rpc('sellora_save_sales_target', {
    p_branch_id: input.branchId, p_agent_id: input.agentId, p_period_type: input.periodType, p_period_start: input.periodStart, p_target: input.amount,
  });
  if (error) throw error;
}

/** Reads the most recent user's own commissions or branch commissions when allowed. */
export async function listCommissions(branchId: string) {
  const { data, error } = await requireDatabase().from('agent_commissions')
    .select('id,agent_id,sale_total,commission_amount,created_at,profiles!agent_commissions_agent_id_fkey(full_name)')
    .eq('branch_id', branchId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
}

/** Saves the active percentage commission rule for future sales in a branch. */
export async function saveCommissionRule(branchId: string, name: string, rate: number) {
  const { error } = await requireDatabase().rpc('sellora_save_commission_rule', { p_branch_id: branchId, p_name: name, p_rate: rate });
  if (error) throw error;
}

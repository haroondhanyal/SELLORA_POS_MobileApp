import { requireSupabase } from '@/services/supabase';

export type Branch = { id: string; name: string; code: string; address: string | null; is_active: boolean };
export type Warehouse = { id: string; branch_id: string; name: string; address: string | null; manager_id: string | null; is_primary: boolean; is_active: boolean };

/** Lists branches visible to this account; database policies hide unassigned branches. */
export async function listBranches() {
  const { data, error } = await requireSupabase().from('branches').select('id, name, code, address, is_active').eq('is_active', true).order('name');
  if (error) throw error;
  return (data ?? []) as Branch[];
}

/** Creates a branch; the database requires approved administrator access. */
export async function createBranch(input: { name: string; code: string; address: string }) {
  const { error } = await requireSupabase().from('branches').insert({ name: input.name.trim(), code: input.code.trim().toUpperCase(), address: input.address.trim() || null });
  if (error) throw error;
}

/** Lists active warehouses in branches assigned to the current user. */
export async function listWarehousesForBranch(branchId?: string) {
  let query = requireSupabase().from('warehouses').select('id, branch_id, name, address, manager_id, is_primary, is_active').eq('is_active', true);
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query.order('name');
  if (error) throw error;
  return (data ?? []) as Warehouse[];
}

/** Creates a warehouse; the database limits this to the branch administration permission. */
export async function createWarehouse(input: { branchId: string; name: string; address: string; managerId: string | null; isPrimary: boolean }) {
  const { data, error } = await requireSupabase().rpc('sellora_create_warehouse', {
    p_branch_id: input.branchId,
    p_name: input.name.trim(),
    p_address: input.address.trim(),
    p_manager_id: input.managerId,
    p_is_primary: input.isPrimary,
  });
  if (error) throw error;
  return data as string;
}

/** Assigns a primary and optional allowed branches atomically via the admin-only RPC. */
export async function assignUserBranches(userId: string, primaryBranchId: string | null, branchIds: string[]) {
  const { error } = await requireSupabase().rpc('sellora_assign_user_branches', {
    target_user: userId,
    target_primary: primaryBranchId,
    target_branches: branchIds,
  });
  if (error) throw error;
}

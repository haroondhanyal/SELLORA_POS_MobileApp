/** Roles that users can request. Administrators approve and assign final roles. */
export const userRoles = ['admin', 'branch_manager', 'sales_manager', 'sales_agent', 'cashier', 'inventory_manager', 'accountant', 'viewer'] as const;
export type UserRole = typeof userRoles[number];
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type UserProfile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  requested_role: UserRole;
  approval_status: ApprovalStatus;
  date_of_birth: string | null;
  avatar_storage_path: string | null;
  primary_branch_id: string | null;
};

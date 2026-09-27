import type { UserProfile } from '@/types/auth';

/** UI visibility helper. Database row-level security remains the real access boundary. */
export function canManageUsers(profile: UserProfile | null, permissionCodes: string[]) {
  return profile?.approval_status === 'approved' && permissionCodes.includes('users.manage');
}

/** Reports whether the signed-in role can edit access grants. */
export function canManageRoles(profile: UserProfile | null, permissionCodes: string[]) {
  return profile?.approval_status === 'approved' && profile.role === 'admin' && permissionCodes.includes('roles.manage');
}

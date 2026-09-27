import { requireSupabase } from '@/services/supabase';
import type { UserRole } from '@/types/auth';

/** Creates an auth account; the database trigger creates its pending profile. */
export async function signUp(input: { name: string; email: string; password: string; phone: string; dateOfBirth: string; role: UserRole }) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      emailRedirectTo: 'sellora://auth/pending-approval',
      data: { full_name: input.name.trim(), phone: input.phone.trim(), date_of_birth: input.dateOfBirth, requested_role: input.role },
    },
  });
  if (error) throw error;
  return data;
}

/** Authenticates with email and password. */
export async function signIn(email: string, password: string) {
  const { data, error } = await requireSupabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
  return data;
}

/** Sends Supabase's password recovery email. */
export async function sendPasswordReset(email: string) {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: 'sellora://auth/reset-password' });
  if (error) throw error;
}

/** Loads the signed-in user's profile, including approval state and assigned role. */
export async function getMyProfile() {
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client.from('profiles').select('id, full_name, email, phone, role, requested_role, approval_status, date_of_birth, avatar_storage_path').eq('id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}

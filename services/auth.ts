import { requireAuthClient } from '@/services/authClient';
import { apiRequest } from '@/services/api';
import { clearDatabaseToken } from '@/services/database';
import type { UserProfile, UserRole } from '@/types/auth';
import { clearOfflineAccount } from '@/services/offlineIdentity';
import { getOfflineAccount } from '@/services/offlineIdentity';
import { isOfflineWorkMode } from '@/services/connectivity';
import { getApiUrl } from '@/services/apiUrl';

function authFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'Authentication failed.');
  if (/fetch failed|network request failed|networkerror|no route to host|econnrefused|timed out/i.test(message)) {
    return new Error(`Sellora server se connection nahi ho saka (${getApiUrl() || 'API URL missing'}). Phone aur computer ko same Wi-Fi par rakho, Expo ko latest URL se kholo, aur computer par Sellora API chalti rehne do.`);
  }
  return error instanceof Error ? error : new Error(message);
}

function throwAuthError(result: { error?: { message?: string } | null }) {
  if (result.error) throw authFailure(result.error.message || 'Authentication failed.');
}

/** Creates an account on the local Better Auth service; /api/me creates its pending profile. */
export async function signUp(input: { name: string; email: string; password: string; phone: string; dateOfBirth: string; role: UserRole }) {
  const client = requireAuthClient();
  let result;
  try {
    result = await client.signUp.email({
      name: input.name.trim(), email: input.email.trim().toLowerCase(), password: input.password,
      phone: input.phone.trim(), dateOfBirth: input.dateOfBirth, requestedRole: input.role,
    } as never);
  } catch (error) {
    throw authFailure(error);
  }
  throwAuthError(result);
  // The auth account is already committed at this point. Profile creation is
  // idempotent and runs again on sign-in, so a transient /api/me failure must
  // not be reported as a failed signup (which prompts duplicate resubmission).
  let selloraProfileProvisioned = true;
  try {
    await apiRequest('/api/me');
  } catch {
    selloraProfileProvisioned = false;
  }
  return { ...result, selloraProfileProvisioned };
}

/** Authenticates against the local Better Auth service. */
export async function signIn(email: string, password: string) {
  let result;
  try {
    result = await requireAuthClient().signIn.email({ email: email.trim().toLowerCase(), password });
  } catch (error) {
    throw authFailure(error);
  }
  throwAuthError(result);
  clearDatabaseToken();
  return result;
}

/** Self-service recovery requires an outbound email transport, which is not configured. */
export async function sendPasswordReset(_email: string) {
  const result = await apiRequest<{ status: boolean; message: string }>('/api/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email: _email.trim().toLowerCase(), redirectTo: 'sellora://auth/reset-password' }),
  });
  if (!result.status) throw new Error('The password reset request could not be accepted. Please try again.');
}

/** Email verification is disabled for this app; approval still gates account access. */
export async function resendSignupConfirmation(_email: string) {
  throw new Error('Email confirmation is disabled. Sign in with your account password.');
}

/** Loads the signed-in user's profile from the local API and database. */
export async function getMyProfile(): Promise<UserProfile | null> {
  const result = await apiRequest<{ profile: UserProfile; permissionCodes: string[] }>('/api/me');
  return result.profile;
}

export async function getCurrentUser() {
  if (await isOfflineWorkMode()) return (await getOfflineAccount())?.user ?? null;
  try {
    const result = await requireAuthClient().getSession();
    const session = (result as unknown as { data?: { user?: { id: string; email?: string | null } } | null }).data;
    return session?.user ?? null;
  } catch {
    return null;
  }
}

export async function signOut() {
  clearDatabaseToken();
  const result = await requireAuthClient().signOut();
  throwAuthError(result);
  await clearOfflineAccount();
}

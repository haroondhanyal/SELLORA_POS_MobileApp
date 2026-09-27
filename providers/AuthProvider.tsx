import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '@/types/auth';
import { getMyProfile } from '@/services/auth';
import { supabase } from '@/services/supabase';
import { hasDevicePin } from '@/services/pin';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import type { EmailOtpType } from '@supabase/supabase-js';

type AuthState = { ready: boolean; session: Session | null; profile: UserProfile | null; permissionCodes: string[]; locked: boolean; unlock: () => void; reloadProfile: () => Promise<UserProfile | null> };
const AuthContext = createContext<AuthState>({ ready: false, session: null, profile: null, permissionCodes: [], locked: false, unlock: () => {}, reloadProfile: async () => null });

/** Keeps the signed-in session and current user's approval profile available to every screen. */
export function AuthProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [permissionCodes, setPermissionCodes] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);

  async function reloadProfile() {
    if (!supabase) { setProfile(null); setPermissionCodes([]); return null; }
    try {
      const nextProfile = await getMyProfile() as UserProfile | null;
      setProfile(nextProfile);
      if (nextProfile?.approval_status === 'approved') {
        const { data } = await supabase.from('role_permissions').select('permission_code').eq('role', nextProfile.role);
        setPermissionCodes((data ?? []).map((row) => row.permission_code));
      } else setPermissionCodes([]);
      return nextProfile;
    } catch { setProfile(null); setPermissionCodes([]); return null; }
  }

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    let active = true;
    async function handleAuthLink(url: string) {
      try {
        const fragment = url.split('#')[1] ?? url.split('?')[1] ?? '';
        const params = new URLSearchParams(fragment);
        const accessToken = params.get('access_token'); const refreshToken = params.get('refresh_token');
        const tokenHash = params.get('token_hash'); const tokenType = params.get('type');
        const code = params.get('code');
        if (accessToken && refreshToken) {
          const { error } = await supabase!.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase!.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && tokenType) {
          const { error } = await supabase!.auth.verifyOtp({ token_hash: tokenHash, type: tokenType as EmailOtpType });
          if (error) throw error;
        }
        const path = Linking.parse(url).path;
        if (path?.includes('reset-password')) router.replace('/auth/reset-password');
        else if (path?.includes('pending-approval')) router.replace('/auth/pending-approval');
      } catch { router.replace('/auth/login'); }
    }
    Linking.getInitialURL().then((url) => { if (url) void handleAuthLink(url); }).catch(() => {});
    const linkListener = Linking.addEventListener('url', ({ url }) => { void handleAuthLink(url); });
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) {
        await reloadProfile();
        if (active) setLocked(await hasDevicePin(data.session.user.id));
      }
      if (active) setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) { setProfile(null); setPermissionCodes([]); setLocked(false); }
      else {
        if (event === 'SIGNED_IN') setLocked(false);
        setTimeout(() => { void reloadProfile(); }, 0);
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); linkListener.remove(); };
  }, []);

  return <AuthContext.Provider value={{ ready, session, profile, permissionCodes, locked, unlock: () => setLocked(false), reloadProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }

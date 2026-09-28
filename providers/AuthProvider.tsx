import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { authClient } from '@/services/authClient';
import { apiRequest } from '@/services/api';
import type { UserProfile } from '@/types/auth';
import { hasDevicePin } from '@/services/pin';
import { useConnection } from '@/providers/ConnectionProvider';
import { getOfflineAccount, saveOfflineAccount, type OfflineAccount } from '@/services/offlineIdentity';

type AppSession = { user: { id: string; email: string | null } };
type AuthState = { ready: boolean; session: AppSession | null; onlineAuthenticated: boolean; profile: UserProfile | null; permissionCodes: string[]; locked: boolean; unlock: () => void; reloadProfile: () => Promise<UserProfile | null> };
const AuthContext = createContext<AuthState>({ ready: false, session: null, onlineAuthenticated: false, profile: null, permissionCodes: [], locked: false, unlock: () => {}, reloadProfile: async () => null });

/** Shares the Better Auth session and API-loaded approval profile across screens. */
export function AuthProvider({ children }: PropsWithChildren) {
  const auth = authClient?.useSession();
  const { connected, mode, ready: connectionReady } = useConnection();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [permissionCodes, setPermissionCodes] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [localAccount, setLocalAccount] = useState<OfflineAccount | null>(null);
  const [localAccountReady, setLocalAccountReady] = useState(false);
  const [localPinReady, setLocalPinReady] = useState(false);
  const sessionRef = useRef<AppSession | null>(null);
  const hasPinRef = useRef(false);
  const sessionData = auth?.data as { user?: { id: string; email?: string | null } } | null | undefined;
  const offlineAvailable = connectionReady && (!connected || mode === 'offline');
  const liveSession: AppSession | null = sessionData?.user ? { user: { id: sessionData.user.id, email: sessionData.user.email ?? null } } : null;
  const session: AppSession | null = liveSession ?? (offlineAvailable && localPinReady && localAccount
    ? { user: localAccount.user }
    : null);

  useEffect(() => {
    let active = true;
    async function loadLocalAccount() {
      const account = await getOfflineAccount();
      const hasPin = account ? await hasDevicePin(account.user.id).catch(() => false) : false;
      if (active) {
        setLocalAccount(account);
        setLocalPinReady(hasPin);
        setLocalAccountReady(true);
      }
    }
    void loadLocalAccount().catch(() => { if (active) setLocalAccountReady(true); });
    return () => { active = false; };
  }, []);

  async function reloadProfile() {
    if (!sessionRef.current) { setProfile(null); setPermissionCodes([]); return null; }
    const actor = sessionRef.current;
    if (!connected || mode === 'offline') {
      const cached = await getOfflineAccount(actor.user.id);
      if (cached) {
        setLocalAccount(cached);
        setProfile(cached.profile);
        setPermissionCodes(cached.permissionCodes);
        return cached.profile;
      }
      setProfile(null); setPermissionCodes([]); return null;
    }
    try {
      const account = await apiRequest<{ profile: UserProfile; permissionCodes: string[] }>('/api/me');
      setProfile(account.profile);
      setPermissionCodes(account.permissionCodes);
      const cached: OfflineAccount = {
        user: { id: actor.user.id, email: actor.user.email },
        profile: account.profile,
        permissionCodes: account.permissionCodes,
      };
      await saveOfflineAccount(cached).catch(() => {});
      setLocalAccount(cached);
      return account.profile;
    } catch {
      const cached = await getOfflineAccount(actor.user.id);
      if (cached) {
        setLocalAccount(cached); setProfile(cached.profile); setPermissionCodes(cached.permissionCodes);
        return cached.profile;
      }
      setProfile(null); setPermissionCodes([]); return null;
    }
  }

  useEffect(() => {
    let active = true;
    sessionRef.current = session;
    async function sync() {
      if (session) {
        await reloadProfile();
        const hasPin = await hasDevicePin(session.user.id).catch(() => false);
        hasPinRef.current = hasPin;
        if (active) setLocked(hasPin || (!liveSession && offlineAvailable));
      } else {
        setProfile(null); setPermissionCodes([]); setLocked(false); hasPinRef.current = false;
      }
      if (active) setReady(connectionReady && localAccountReady && !auth?.isPending);
    }
    void sync();
    return () => { active = false; };
  }, [session?.user.id, auth?.isPending, connected, mode, connectionReady, localAccountReady]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' && sessionRef.current && hasPinRef.current) setLocked(true);
      if (nextState === 'active') void auth?.refetch();
    });
    return () => listener.remove();
  }, [auth?.refetch]);

  useEffect(() => {
    if (connected && mode === 'online') void auth?.refetch();
  }, [connected, mode]);

  return <AuthContext.Provider value={{ ready, session, onlineAuthenticated: Boolean(liveSession), profile, permissionCodes, locked, unlock: () => setLocked(false), reloadProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }

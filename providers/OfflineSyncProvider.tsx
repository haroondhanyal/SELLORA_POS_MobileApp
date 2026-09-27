import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useConnection } from '@/providers/ConnectionProvider';
import { syncOfflineSales } from '@/services/offlineSales';

type SyncContextValue = { syncing: boolean; refresh: () => Promise<void> };
const SyncContext = createContext<SyncContextValue>({ syncing: false, refresh: async () => {} });

/** Retries queued sales when this approved user's device returns to online mode. */
export function OfflineSyncProvider({ children }: PropsWithChildren) {
  const { session, profile } = useAuth();
  const { mode, connected } = useConnection();
  const [syncing, setSyncing] = useState(false);
  const running = useRef(false);
  useEffect(() => {
    if (mode !== 'online' || !connected || !session?.user.id || profile?.approval_status !== 'approved') return;
    let active = true;
    const run = async () => {
      if (!active || running.current) return;
      running.current = true;
      setSyncing(true);
      try { await syncOfflineSales(session.user.id); } catch { /* The sync queue keeps failures visible for a later retry. */ } finally { running.current = false; if (active) setSyncing(false); }
    };
    void run();
    const interval = setInterval(() => { void run(); }, 30_000);
    return () => { active = false; clearInterval(interval); };
  }, [mode, connected, session?.user.id, profile?.approval_status]);
  async function refresh() {
    if (!session?.user.id || mode !== 'online' || !connected || running.current) return;
    running.current = true; setSyncing(true);
    try { await syncOfflineSales(session.user.id); } finally { running.current = false; setSyncing(false); }
  }
  return <SyncContext.Provider value={{ syncing, refresh }}>{children}</SyncContext.Provider>;
}

export function useOfflineSync() { return useContext(SyncContext); }

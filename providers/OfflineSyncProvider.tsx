import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/providers/AuthProvider';
import { useConnection } from '@/providers/ConnectionProvider';
import { syncOfflineSales } from '@/services/offlineSales';
import { syncOfflineCustomers } from '@/services/customers';
import { syncOfflineProducts, syncOfflineVariants } from '@/services/catalog';
import { syncOfflineExpenses, syncOfflinePurchaseOrders } from '@/services/operations';
import { apiRequest } from '@/services/api';
import { getDeviceId } from '@/services/device';

type SyncContextValue = { syncing: boolean; refresh: () => Promise<void> };
const SyncContext = createContext<SyncContextValue>({ syncing: false, refresh: async () => {} });

/** Retries queued sales when this approved user's device returns to online mode. */
export function OfflineSyncProvider({ children }: PropsWithChildren) {
  const { session, onlineAuthenticated, profile } = useAuth();
  const { mode, connected } = useConnection();
  const [syncing, setSyncing] = useState(false);
  const running = useRef(false);
  // Heartbeats belong to a signed-in approved user on this device only. One
  // admin switching to offline mode therefore never changes cashier devices.
  useEffect(() => {
    if (mode !== 'online' || !connected || !onlineAuthenticated || !session?.user.id || profile?.approval_status !== 'approved') return;
    let active = true;
    let heartbeatRunning = false;
    const beat = async () => {
      if (!active || AppState.currentState !== 'active' || heartbeatRunning) return;
      heartbeatRunning = true;
      try { await apiRequest('/api/presence/heartbeat', { method: 'POST', body: JSON.stringify({ deviceId: await getDeviceId() }) }); }
      catch { /* A missed heartbeat naturally expires and is retried on the next interval. */ }
      finally { heartbeatRunning = false; }
    };
    void beat();
    const interval = setInterval(() => { void beat(); }, 30_000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void beat(); });
    return () => { active = false; clearInterval(interval); listener.remove(); };
  }, [mode, connected, onlineAuthenticated, session?.user.id, profile?.approval_status]);

  useEffect(() => {
    if (mode !== 'online' || !connected || !onlineAuthenticated || !session?.user.id || profile?.approval_status !== 'approved') return;
    let active = true;
    const run = async () => {
      if (!active || running.current) return;
      running.current = true;
      setSyncing(true);
      try {
        await syncOfflineProducts(session.user.id);
        await syncOfflineVariants(session.user.id);
        await syncOfflineCustomers(session.user.id);
        await syncOfflinePurchaseOrders(session.user.id);
        await syncOfflineExpenses(session.user.id);
        await syncOfflineSales(session.user.id);
      } catch { /* Failed records stay visible in the queue for a later retry. */ } finally { running.current = false; if (active) setSyncing(false); }
    };
    void run();
    const interval = setInterval(() => { void run(); }, 30_000);
    return () => { active = false; clearInterval(interval); };
  }, [mode, connected, onlineAuthenticated, session?.user.id, profile?.approval_status]);
  async function refresh() {
    if (!session?.user.id || !onlineAuthenticated || mode !== 'online' || !connected || running.current) return;
    running.current = true; setSyncing(true);
    try { await syncOfflineProducts(session.user.id); await syncOfflineVariants(session.user.id); await syncOfflineCustomers(session.user.id); await syncOfflinePurchaseOrders(session.user.id); await syncOfflineExpenses(session.user.id); await syncOfflineSales(session.user.id); } finally { running.current = false; setSyncing(false); }
  }
  return <SyncContext.Provider value={{ syncing, refresh }}>{children}</SyncContext.Provider>;
}

export function useOfflineSync() { return useContext(SyncContext); }

import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import { isApiReachable } from '@/services/connectivity';

type WorkMode = 'online' | 'offline';
type ConnectionState = { mode: WorkMode; connected: boolean; ready: boolean; setMode: (mode: WorkMode) => Promise<void> };
const ConnectionContext = createContext<ConnectionState>({ mode: 'online', connected: false, ready: false, setMode: async () => {} });

/** Tracks live internet availability and the user's saved manual work mode. */
export function ConnectionProvider({ children }: PropsWithChildren) {
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [mode, setModeState] = useState<WorkMode>('online');
  useEffect(() => {
    SecureStore.getItemAsync('sellora_work_mode').then((saved) => { if (saved === 'offline') setModeState('offline'); }).catch(() => {});
    let active = true;
    let networkAvailable = false;
    let probeRunning = false;
    const probe = async () => {
      if (!active || probeRunning || !networkAvailable) return;
      probeRunning = true;
      const reachable = await isApiReachable();
      if (active) { setConnected(reachable); setReady(true); }
      probeRunning = false;
    };
    const onNetwork = (isConnected: boolean | null) => {
      networkAvailable = Boolean(isConnected);
      if (!networkAvailable) { setConnected(false); setReady(true); }
      else void probe();
    };
    const unsubscribe = NetInfo.addEventListener((state) => onNetwork(state.isConnected));
    void NetInfo.fetch().then((state) => onNetwork(state.isConnected)).catch(() => { setReady(true); });
    const interval = setInterval(() => { if (networkAvailable) void probe(); }, 15_000);
    return () => { active = false; unsubscribe(); clearInterval(interval); };
  }, []);
  async function setMode(next: WorkMode) {
    await SecureStore.setItemAsync('sellora_work_mode', next);
    setModeState(next);
  }
  return <ConnectionContext.Provider value={{ mode, connected, ready, setMode }}>{children}</ConnectionContext.Provider>;
}

export function useConnection() { return useContext(ConnectionContext); }

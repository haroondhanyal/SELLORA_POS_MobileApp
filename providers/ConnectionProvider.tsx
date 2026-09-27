import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';

type WorkMode = 'online' | 'offline';
type ConnectionState = { mode: WorkMode; connected: boolean; setMode: (mode: WorkMode) => Promise<void> };
const ConnectionContext = createContext<ConnectionState>({ mode: 'online', connected: false, setMode: async () => {} });

/** Tracks live internet availability and the user's saved manual work mode. */
export function ConnectionProvider({ children }: PropsWithChildren) {
  const [connected, setConnected] = useState(false);
  const [mode, setModeState] = useState<WorkMode>('online');
  useEffect(() => {
    SecureStore.getItemAsync('sellora_work_mode').then((saved) => { if (saved === 'offline') setModeState('offline'); }).catch(() => {});
    return NetInfo.addEventListener((state) => setConnected(Boolean(state.isConnected && state.isInternetReachable !== false)));
  }, []);
  async function setMode(next: WorkMode) {
    await SecureStore.setItemAsync('sellora_work_mode', next);
    setModeState(next);
  }
  return <ConnectionContext.Provider value={{ mode, connected, setMode }}>{children}</ConnectionContext.Provider>;
}

export function useConnection() { return useContext(ConnectionContext); }

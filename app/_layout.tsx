import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/providers/AuthProvider';
import { ConnectionProvider } from '@/providers/ConnectionProvider';
import { SQLiteProvider } from 'expo-sqlite';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeLocalDatabase } from '@/services/localDb';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { CartProvider } from '@/providers/CartProvider';
import { CurrencyProvider } from '@/providers/CurrencyProvider';
import { OfflineSyncProvider } from '@/providers/OfflineSyncProvider';
import { useTheme } from '@/theme/ThemeProvider';

/** Root navigation: each app feature is kept in its own route file. */
export default function RootLayout() {
  return <SafeAreaProvider><SQLiteProvider databaseName="sellora.db" onInit={initializeLocalDatabase}><ThemeProvider><ConnectionProvider><AuthProvider><OfflineSyncProvider><CurrencyProvider><CartProvider><ThemedNavigation /></CartProvider></CurrencyProvider></OfflineSyncProvider></AuthProvider></ConnectionProvider></ThemeProvider></SQLiteProvider></SafeAreaProvider>;
}

/** Remounts screens on appearance changes so shared color tokens repaint everywhere. */
function ThemedNavigation() {
  const { name, mode, resolvedMode } = useTheme();
  return <><StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} /><Stack key={`${name}-${mode}-${resolvedMode}`} screenOptions={{ headerShown: false, animation: 'fade' }} /></>;
}

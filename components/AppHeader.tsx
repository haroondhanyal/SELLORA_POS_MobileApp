import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import type { UserProfile } from '@/types/auth';
import { useConnection } from '@/providers/ConnectionProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { getAvatarUrl } from '@/services/avatars';
import { colors } from '@/theme/colors';

/** Shared signed-in header with profile, connection state and display-currency picker. */
export function AppHeader({ profile }: { profile: UserProfile | null }) {
  const { mode, connected, setMode } = useConnection();
  const { currency, setCurrency } = useCurrency();
  const db = useSQLiteContext();
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const online = connected && mode === 'online';

  useEffect(() => {
    if (!profile?.id) { setPending(0); return; }
    let active = true;
    const loadPending = () => db.getFirstAsync<{ count: number }>("SELECT (SELECT count(*) FROM offline_sales WHERE user_id=? AND status IN ('pending','failed','syncing')) + (SELECT count(*) FROM offline_customers WHERE user_id=? AND status IN ('pending','failed','syncing')) as count", profile.id, profile.id)
      .then((row) => { if (active) setPending(row?.count ?? 0); })
      .catch(() => {});
    void loadPending();
    const interval = setInterval(() => { void loadPending(); }, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [db, profile?.id]);

  useEffect(() => {
    if (profile?.avatar_storage_path) {
      getAvatarUrl(profile.avatar_storage_path).then(setAvatarUri).catch(() => setAvatarUri(null));
    } else setAvatarUri(null);
  }, [profile?.avatar_storage_path]);

  async function saveMode(next: 'online' | 'offline') {
    try {
      await setMode(next);
      setConnectionOpen(false);
    } catch {
      Alert.alert('Could not save connection mode', 'Please try again.');
    }
  }

  function requestMode(next: 'online' | 'offline') {
    if (next === 'offline' && mode !== 'offline') {
      Alert.alert('Switch to Offline Mode?', 'New transactions will be stored on this device and synchronized when Online Mode is restored.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch offline', onPress: () => { void saveMode(next); } },
      ]);
      return;
    }
    void saveMode(next);
  }

  function chooseCurrency() {
    Alert.alert('Display currency', 'Choose how Sellora shows prices on this device.', [
      { text: 'PKR', onPress: () => { void setCurrency('PKR').catch(showCurrencyError); } },
      { text: 'USD', onPress: () => { void setCurrency('USD').catch(showCurrencyError); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <>
      <View style={styles.header}>
        <Pressable onPress={() => router.push('/profile')} style={styles.identity}>
          {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatar} /> : (
            <View style={styles.avatarFallback}>
              <Text style={styles.initials}>{(profile?.full_name || 'S').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</Text>
            </View>
          )}
          <View>
            <Text style={styles.name}>{profile?.full_name || 'Sellora user'}</Text>
            <Text style={styles.hint}>{profile?.role.replaceAll('_', ' ')}</Text>
          </View>
        </Pressable>
        <View style={styles.rightActions}>
          <Pressable accessibilityRole="button" onPress={() => setConnectionOpen(true)} style={styles.status}>
            <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.warning }]} />
            <Text style={styles.statusText}>{online ? 'Online' : 'Offline'}{pending ? ` · ${pending}` : ''}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={chooseCurrency} style={styles.currencyButton}>
            <Text style={styles.currencyText}>{currency} ▾</Text>
          </Pressable>
        </View>
      </View>

      <Modal transparent visible={connectionOpen} animationType="slide" onRequestClose={() => setConnectionOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setConnectionOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Connection mode</Text>
            <Text style={styles.detail}>Network: {connected ? 'Connected' : 'No internet connection'}</Text>
            <Text style={styles.detail}>Work mode: {mode === 'online' ? 'Online' : 'Offline'}</Text>
            <Text style={styles.detail}>Pending sync: {pending}</Text>
            <Text style={styles.detail}>Last sync: Not synced yet</Text>
            <Pressable onPress={() => { setConnectionOpen(false); router.push('/settings/sync'); }}><Text style={styles.modeText}>Open sync queue</Text></Pressable>
            <Pressable style={styles.modeRow} onPress={() => requestMode('online')}><Text style={styles.modeText}>{mode === 'online' ? '●' : '○'}  Work Online</Text></Pressable>
            <Pressable style={styles.modeRow} onPress={() => requestMode('offline')}><Text style={styles.modeText}>{mode === 'offline' ? '●' : '○'}  Work Offline</Text></Pressable>
            <Pressable onPress={() => setConnectionOpen(false)} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function showCurrencyError() {
  Alert.alert('Could not save currency preference', 'Please try again.');
}

const styles = StyleSheet.create({
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5F6F1', alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.tealDark, fontWeight: '800' }, name: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  hint: { color: colors.muted, fontSize: 11, textTransform: 'capitalize', marginTop: 2 },
  rightActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 9, borderRadius: 99, backgroundColor: 'white', borderWidth: 1, borderColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 }, statusText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  currencyButton: { paddingHorizontal: 7, paddingVertical: 10 }, currencyText: { color: colors.tealDark, fontWeight: '800', fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' },
  sheet: { padding: 24, paddingBottom: 34, backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  grabber: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 21, fontWeight: '800', color: colors.navy, marginBottom: 16 }, detail: { color: colors.muted, marginVertical: 5 },
  modeRow: { minHeight: 48, justifyContent: 'center', borderTopWidth: 1, borderColor: colors.border, marginTop: 10 }, modeText: { color: colors.text, fontWeight: '700' },
  close: { backgroundColor: colors.background, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 }, closeText: { color: colors.navy, fontWeight: '700' },
});

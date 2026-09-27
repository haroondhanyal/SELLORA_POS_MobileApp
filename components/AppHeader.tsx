import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import type { UserProfile } from '@/types/auth';
import { useConnection } from '@/providers/ConnectionProvider';
import { colors } from '@/theme/colors';
import { getAvatarUrl } from '@/services/avatars';

/** Shared signed-in header with tappable network state and manual work-mode choice. */
export function AppHeader({ profile }: { profile: UserProfile | null }) {
  const { mode, connected, setMode } = useConnection();
  const db = useSQLiteContext();
  const [open, setOpen] = useState(false); const [pending, setPending] = useState(0); const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const online = connected && mode === 'online';
  useEffect(() => { let active = true; db.getFirstAsync<{ count: number }>("SELECT count(*) as count FROM sync_queue WHERE status = 'pending'").then((row) => { if (active) setPending(row?.count ?? 0); }).catch(() => {}); return () => { active = false; }; }, [db]);
  useEffect(() => { if (profile?.avatar_storage_path) getAvatarUrl(profile.avatar_storage_path).then(setAvatarUri).catch(() => setAvatarUri(null)); else setAvatarUri(null); }, [profile?.avatar_storage_path]);
  async function saveMode(next: 'online' | 'offline') {
    try {
      await setMode(next);
      setOpen(false);
    } catch {
      Alert.alert('Could not save connection mode', 'Please try again.');
    }
  }

  function requestMode(next: 'online' | 'offline') {
    if (next === 'offline' && mode !== 'offline') {
      Alert.alert('Switch to Offline Mode?', 'New transactions will be stored on this device and synchronized when Online Mode is restored.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Switch offline', onPress: () => { void saveMode(next); } }]);
      return;
    }
    void saveMode(next);
  }
  return <>
    <View style={styles.header}><Pressable onPress={() => router.push('/profile')} style={styles.identity}>{avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.initials}>{(profile?.full_name || 'S').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</Text></View>}<View><Text style={styles.name}>{profile?.full_name || 'Sellora user'}</Text><Text style={styles.hint}>{profile?.role.replaceAll('_', ' ')}</Text></View></Pressable><Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.status}><View style={[styles.dot, { backgroundColor: online ? colors.success : colors.warning }]} /><Text style={styles.statusText}>{online ? 'Online' : 'Offline'}{pending ? ` · ${pending}` : ''}</Text></Pressable></View>
    <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}><Pressable style={styles.backdrop} onPress={() => setOpen(false)}><Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}><View style={styles.grabber} /><Text style={styles.sheetTitle}>Connection mode</Text><Text style={styles.detail}>Network: {connected ? 'Connected' : 'No internet connection'}</Text><Text style={styles.detail}>Work mode: {mode === 'online' ? 'Online' : 'Offline'}</Text><Text style={styles.detail}>Pending sync: {pending}</Text><Text style={styles.detail}>Last sync: Not synced yet</Text><Pressable style={styles.modeRow} onPress={() => requestMode('online')}><Text style={styles.modeText}>{mode === 'online' ? '●' : '○'}  Work Online</Text></Pressable><Pressable style={styles.modeRow} onPress={() => requestMode('offline')}><Text style={styles.modeText}>{mode === 'offline' ? '●' : '○'}  Work Offline</Text></Pressable><Pressable onPress={() => setOpen(false)} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable></Pressable></Pressable></Modal>
  </>;
}

const styles = StyleSheet.create({ header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 40, height: 40, borderRadius: 20 }, avatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5F6F1', alignItems: 'center', justifyContent: 'center' }, initials: { color: colors.tealDark, fontWeight: '800' }, name: { color: colors.navy, fontWeight: '800', fontSize: 15 }, hint: { color: colors.muted, fontSize: 11, textTransform: 'capitalize', marginTop: 2 }, status: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 99, backgroundColor: 'white', borderWidth: 1, borderColor: colors.border }, dot: { width: 8, height: 8, borderRadius: 4 }, statusText: { color: colors.text, fontWeight: '700', fontSize: 12 }, backdrop: { flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' }, sheet: { padding: 24, paddingBottom: 34, backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24 }, grabber: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 18 }, sheetTitle: { fontSize: 21, fontWeight: '800', color: colors.navy, marginBottom: 16 }, detail: { color: colors.muted, marginVertical: 5 }, modeRow: { minHeight: 48, justifyContent: 'center', borderTopWidth: 1, borderColor: colors.border, marginTop: 10 }, modeText: { color: colors.text, fontWeight: '700' }, close: { backgroundColor: colors.background, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 }, closeText: { color: colors.navy, fontWeight: '700' } });

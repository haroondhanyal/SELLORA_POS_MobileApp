import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { listNotifications, markNotificationRead } from '@/services/oversight';
import { requireSupabase } from '@/services/supabase';
import { colors } from '@/theme/colors';

/** Personal notification center updated by Supabase Realtime. */
export default function NotificationsScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const load = useCallback(async () => {
    try { setRows(await listNotifications()); }
    catch (error) { Alert.alert('Could not load notifications', error instanceof Error ? error.message : 'Please try again.'); }
  }, []);

  useEffect(() => {
    void load();
    if (!profile?.id) return;
    const channel = requireSupabase().channel(`sellora-notifications-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, () => void load())
      .subscribe();
    return () => { void requireSupabase().removeChannel(channel); };
  }, [load, profile?.id]);

  async function read(row: any) {
    if (row.read_at) return;
    try {
      await markNotificationRead(row.id);
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, read_at: new Date().toISOString() } : item));
    } catch (error) { Alert.alert('Could not update notification', error instanceof Error ? error.message : 'Please retry.'); }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!permissionCodes.includes('notifications.view')) return <Screen><Text>Access denied</Text></Screen>;

  return <Screen><View style={styles.page}>
    <AppHeader profile={profile} />
    <Text style={styles.title}>Notifications</Text>
    {rows.map((row) => <Pressable key={row.id} onPress={() => void read(row)} style={[styles.card, !row.read_at && styles.unread]}>
      <Text style={styles.category}>{row.category}</Text><Text style={styles.name}>{row.title}</Text>
      <Text style={styles.body}>{row.body}</Text><Text style={styles.date}>{new Date(row.created_at).toLocaleString()}</Text>
    </Pressable>)}
    {!rows.length ? <Text style={styles.body}>You are all caught up.</Text> : null}
  </View></Screen>;
}

const styles = StyleSheet.create({
  page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 27, fontWeight: '800', marginTop: 24 },
  card: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 15, marginTop: 11 },
  unread: { borderColor: colors.tealDark, backgroundColor: '#F2FBF8' }, category: { color: colors.tealDark, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  name: { color: colors.navy, fontWeight: '800', marginTop: 4 }, body: { color: colors.muted, marginTop: 5, lineHeight: 20 }, date: { color: colors.muted, fontSize: 11, marginTop: 8 },
});

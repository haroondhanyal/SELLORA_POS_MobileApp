import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, type Href } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { clearDevicePin } from '@/services/pin';
import { signOut } from '@/services/auth';
import { getAvatarUrl } from '@/services/avatars';
import { useTheme } from '@/theme/ThemeProvider';

type GuestSection = 'overview' | 'pos' | 'products' | 'inventory' | 'customers' | 'purchases' | 'expenses' | 'reports' | 'approvals' | 'team' | 'branches' | 'settings' | 'profile';
type DrawerProps = { visible: boolean; onClose: () => void; mode?: 'app' | 'guest'; onGuestNavigate?: (section: GuestSection) => void };
type Item = { label: string; icon: string; href?: Href; permission?: string; anyPermission?: string[]; adminOnly?: boolean };

const guestItems: { label: string; icon: string; section: GuestSection }[] = [
  { label: 'Overview', icon: '⌂', section: 'overview' }, { label: 'Point of sale', icon: '▣', section: 'pos' },
  { label: 'Products', icon: '▤', section: 'products' }, { label: 'Inventory', icon: '▦', section: 'inventory' },
  { label: 'Customers', icon: '♙', section: 'customers' }, { label: 'Purchases', icon: '⇩', section: 'purchases' },
  { label: 'Expenses', icon: '¤', section: 'expenses' }, { label: 'Reports', icon: '▥', section: 'reports' },
  { label: 'Approvals', icon: '✓', section: 'approvals' }, { label: 'Team & shifts', icon: '♧', section: 'team' },
  { label: 'Branches', icon: '⌖', section: 'branches' }, { label: 'Settings', icon: '⚙', section: 'settings' },
  { label: 'Profile & security', icon: '♙', section: 'profile' },
];

/** Side navigation shared by authenticated app screens and the isolated guest preview. */
export function SlideDrawer({ visible, onClose, mode = 'app', onGuestNavigate }: DrawerProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { profile, permissionCodes, session } = useAuth();
  const drawerWidth = Math.min(width * 0.86, 360);
  const translateX = useRef(new Animated.Value(-drawerWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setAvatarUri(null);
    if (mode === 'app' && profile?.avatar_storage_path) {
      void getAvatarUrl(profile.avatar_storage_path)
        .then((uri) => { if (active) setAvatarUri(uri); })
        .catch(() => { if (active) setAvatarUri(null); });
    }
    return () => { active = false; };
  }, [mode, profile?.avatar_storage_path, visible]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateX.setValue(-drawerWidth);
      backdropOpacity.setValue(0);
      requestAnimationFrame(() => Animated.parallel([
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 220 }),
        Animated.timing(backdropOpacity, { toValue: 0.48, duration: 180, useNativeDriver: true }),
      ]).start());
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -drawerWidth, duration: 180, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [visible, drawerWidth, translateX, backdropOpacity]);

  async function leaveAccount() {
    try {
      await clearDevicePin();
      await signOut();
      onClose();
      router.replace('/welcome');
    } catch (error) {
      Alert.alert('Could not sign out', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  function openRoute(href: Href) {
    onClose();
    requestAnimationFrame(() => router.push(href));
  }

  const sections: { title: string; items: Item[] }[] = [
    { title: 'WORKSPACE', items: [
      { label: 'Dashboard', icon: '⌂', href: '/dashboard' },
      { label: 'Point of sale', icon: '▣', href: '/pos', permission: 'sales.create' },
      { label: 'Products & catalogue', icon: '▤', href: '/products', anyPermission: ['products.view', 'products.manage'] },
      { label: 'Categories & brands', icon: '⊞', href: '/products/categories', permission: 'products.manage' },
      { label: 'Add a product', icon: '＋', href: '/products/add', permission: 'products.manage' },
      { label: 'Inventory', icon: '▦', href: '/inventory', anyPermission: ['inventory.view', 'inventory.manage'] },
      { label: 'Stock adjustment', icon: '±', href: '/inventory/adjustment', permission: 'inventory.manage' },
      { label: 'Customers', icon: '♙', href: '/customers', anyPermission: ['customers.view', 'customers.manage'] },
      { label: 'Loyalty rewards', icon: '☆', href: '/customers/loyalty', permission: 'customers.manage' },
      { label: 'Customer credit payments', icon: '¤', href: '/customers/payments', permission: 'customers.credit.manage' },
      { label: 'Purchases & GRNs', icon: '⇩', href: '/purchases', permission: 'inventory.manage' },
      { label: 'Expenses', icon: '¤', href: '/expenses', anyPermission: ['expenses.view', 'expenses.manage'] },
      { label: 'Returns & refunds', icon: '↩', href: '/returns', permission: 'returns.manage' },
      { label: 'Finance overview', icon: '▥', href: '/finance', anyPermission: ['reports.view', 'expenses.view', 'expenses.manage'] },
      { label: 'Reports & audit', icon: '▥', href: '/reports', anyPermission: ['reports.view', 'audit.view'] },
      { label: 'Detailed sales report', icon: '▤', href: '/reports/details', permission: 'reports.view' },
    ] },
    { title: 'TEAM & OPERATIONS', items: [
      { label: 'Administrator panel', icon: '♧', href: '/admin', adminOnly: true },
      { label: 'Manage users & approvals', icon: '✓', href: '/users', permission: 'users.manage' },
      { label: 'Role permissions', icon: '⚿', href: '/roles', permission: 'roles.manage' },
      { label: 'Branches', icon: '⌖', href: '/branches', permission: 'branches.manage' },
      { label: 'Warehouses', icon: '▥', href: '/warehouses', permission: 'warehouses.manage' },
      { label: 'Suppliers', icon: '♧', href: '/suppliers', permission: 'inventory.manage' },
      { label: 'Stock transfers', icon: '⇄', href: '/transfers', permission: 'inventory.manage' },
      { label: 'Shifts & cash drawer', icon: '◷', href: '/shifts', permission: 'shifts.manage' },
      { label: 'Sales targets', icon: '◎', href: '/targets', anyPermission: ['targets.manage', 'sales.view_own'] },
      { label: 'Commissions', icon: '%', href: '/commissions', permission: 'commissions.view' },
      { label: 'Approval requests', icon: '✓', href: '/approvals', permission: 'approvals.view' },
      { label: 'Request an approval', icon: '＋', href: '/approvals/request', permission: 'approvals.request' },
      { label: 'Notifications', icon: '♧', href: '/notifications', permission: 'notifications.view' },
      { label: 'Business backup', icon: '⇧', href: '/settings/backup', adminOnly: true },
      { label: 'Sellora Copilot', icon: '✦', href: '/ai', anyPermission: ['reports.view', 'sales.view_own'] },
    ] },
    { title: 'ACCOUNT & SETTINGS', items: [
      { label: 'Profile & security', icon: '♙', href: '/profile' },
      { label: 'Offline & sync queue', icon: '⇄', href: '/settings/sync' },
      { label: 'Currency', icon: '¤', href: '/settings/currency' },
      { label: 'Appearance', icon: '◐', href: '/settings/appearance' },
    ] },
  ];
  const visibleSections = sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.adminOnly && profile?.role !== 'admin') return false;
      if (item.permission && !permissionCodes.includes(item.permission)) return false;
      if (item.anyPermission && !item.anyPermission.some((permission) => permissionCodes.includes(permission))) return false;
      return Boolean(session);
    }),
  })).filter((section) => section.items.length > 0);

  return <Modal transparent visible={mounted} animationType="none" statusBarTranslucent onRequestClose={onClose}>
    <View style={styles.modal}>
      <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdropOpacity }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Close navigation menu" onPress={onClose} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.drawer, { width: drawerWidth, backgroundColor: theme.colors.surface, transform: [{ translateX }] }]}>
        <View style={[styles.drawerHeader, { borderBottomColor: theme.colors.border }]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} onError={() => setAvatarUri(null)} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.colors.surfaceTint }]}>
              <Text style={[styles.avatarText, { color: theme.colors.tealDark }]}>{mode === 'guest' ? 'G' : initials(profile?.full_name)}</Text>
            </View>
          )}
          <View style={styles.identity}>
            <Text numberOfLines={1} style={[styles.name, { color: theme.colors.text }]}>{mode === 'guest' ? 'Guest preview' : profile?.full_name || 'Sellora account'}</Text>
            <Text style={[styles.role, { color: theme.colors.muted }]}>{mode === 'guest' ? 'Sample data · read only' : profile?.role.replaceAll('_', ' ') || 'Signed in'}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close navigation menu" onPress={onClose} hitSlop={10}><Text style={[styles.close, { color: theme.colors.muted }]}>×</Text></Pressable>
        </View>

        {mode === 'guest' ? <ScrollView style={styles.menu} contentContainerStyle={styles.menuContent}>
          <Text style={[styles.groupTitle, { color: theme.colors.muted }]}>EXPLORE DEMO</Text>
          {guestItems.map((item) => <MenuItem key={item.section} label={item.label} icon={item.icon} onPress={() => { onClose(); onGuestNavigate?.(item.section); }} />)}
          <Text style={[styles.groupTitle, { color: theme.colors.muted, marginTop: 16 }]}>ACCOUNT</Text>
          <MenuItem label="Create account" icon="＋" onPress={() => openRoute('/auth/signup')} />
          <MenuItem label="Sign in" icon="→" onPress={() => openRoute('/auth/login')} />
        </ScrollView> : <ScrollView style={styles.menu} contentContainerStyle={styles.menuContent}>
          {visibleSections.map((section) => <View key={section.title}>
            <Text style={[styles.groupTitle, { color: theme.colors.muted }]}>{section.title}</Text>
            {section.items.map((item) => <MenuItem key={item.label} label={item.label} icon={item.icon} onPress={() => item.href && openRoute(item.href)} />)}
          </View>)}
        </ScrollView>}

        <View style={[styles.bottom, { borderTopColor: theme.colors.border }]}>
          {mode === 'guest'
            ? <MenuItem label="Exit guest preview" icon="↪" danger onPress={() => { onClose(); router.replace('/welcome'); }} />
            : <MenuItem label="Sign out" icon="↪" danger onPress={() => { void leaveAccount(); }} />}
        </View>
      </Animated.View>
    </View>
  </Modal>;
}

function MenuItem({ label, icon, onPress, danger = false }: { label: string; icon: string; onPress: () => void; danger?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.colors.surfaceTint }]}>
    <Text style={[styles.icon, { color: danger ? theme.colors.danger : theme.colors.tealDark }]}>{icon}</Text>
    <Text style={[styles.itemLabel, { color: danger ? theme.colors.danger : theme.colors.text }]}>{label}</Text>
    <Text style={[styles.chevron, { color: theme.colors.muted }]}>›</Text>
  </Pressable>;
}

function initials(name?: string | null) { return (name || 'S').split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase(); }

const styles = StyleSheet.create({
  modal: { flex: 1, flexDirection: 'row' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#000000' },
  drawer: { height: '100%', paddingTop: 54, paddingBottom: 20, elevation: 20, shadowColor: '#000', shadowOffset: { width: 5, height: 0 }, shadowOpacity: 0.18, shadowRadius: 18 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 17, paddingBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 44, height: 44, borderRadius: 15 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '900', fontSize: 16 },
  identity: { flex: 1 },
  name: { fontWeight: '900', fontSize: 15 },
  role: { textTransform: 'capitalize', fontSize: 12, marginTop: 4 },
  close: { fontSize: 28, paddingHorizontal: 5, lineHeight: 30 },
  menu: { flex: 1 },
  menuContent: { paddingHorizontal: 12, paddingVertical: 10 },
  groupTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginTop: 16, marginBottom: 5, paddingHorizontal: 7 },
  item: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 11, paddingHorizontal: 9 },
  icon: { width: 22, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  itemLabel: { fontSize: 14, fontWeight: '700', flex: 1 },
  chevron: { fontSize: 22 },
  bottom: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 9 },
});

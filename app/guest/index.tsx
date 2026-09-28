import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { Brand } from '@/components/Brand';
import { Screen } from '@/components/Screen';
import { AppearanceToggle } from '@/components/AppearanceToggle';
import { SlideDrawer } from '@/components/SlideDrawer';
import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme/colors';

const modules = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'pos', label: 'Point of sale', icon: '▣' },
  { id: 'products', label: 'Products', icon: '▤' },
  { id: 'inventory', label: 'Inventory', icon: '▦' },
  { id: 'customers', label: 'Customers', icon: '♙' },
  { id: 'purchases', label: 'Purchases', icon: '⇩' },
  { id: 'expenses', label: 'Expenses', icon: '¤' },
  { id: 'reports', label: 'Reports', icon: '▥' },
  { id: 'approvals', label: 'Approvals', icon: '✓' },
  { id: 'team', label: 'Team & shifts', icon: '♧' },
  { id: 'branches', label: 'Branches', icon: '⌖' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'profile', label: 'Profile & security', icon: '♙' },
] as const;

type ModuleId = (typeof modules)[number]['id'];

/** Isolated, read-only sample tour. It never signs in or calls the business API. */
export default function GuestDemoScreen() {
  const theme = useTheme();
  const [active, setActive] = useState<ModuleId>('overview');
  const [cartCount, setCartCount] = useState(0);
  const [approvedPreview, setApprovedPreview] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notice, setNotice] = useState('');

  function showNotice(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(''), 2200);
  }

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.top}>
          <Brand compact />
          <View style={styles.topActions}><AppearanceToggle /><Pressable accessibilityRole="button" accessibilityLabel="Open navigation menu" onPress={() => setDrawerOpen(true)} style={styles.menuButton}><Text style={[styles.menuIcon, { color: theme.colors.text }]}>☰</Text></Pressable></View>
        </View>
        <SlideDrawer visible={drawerOpen} mode="guest" onClose={() => setDrawerOpen(false)} onGuestNavigate={(section) => setActive(section)} />
        <View style={[styles.demoBanner, { backgroundColor: theme.colors.surfaceTint, borderColor: theme.colors.border }]}>
          <Text style={[styles.demoLabel, { color: theme.colors.tealDark }]}>GUEST PREVIEW · SAMPLE DATA</Text>
          <Text style={[styles.disclaimer, { color: theme.colors.muted }]}>Explore Sellora without an account. Demo actions are temporary and never saved.</Text>
        </View>

        <Text style={[styles.heading, { color: theme.colors.text }]}>Explore your store</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moduleRail}>
          {modules.map((item) => {
            const selected = active === item.id;
            return <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setActive(item.id); setNotice(''); }} style={[styles.moduleChip, { backgroundColor: selected ? theme.colors.teal : theme.colors.surface, borderColor: selected ? theme.colors.teal : theme.colors.border }]}>
              <Text style={[styles.moduleIcon, { color: selected ? '#FFFFFF' : theme.colors.tealDark }]}>{item.icon}</Text>
              <Text style={[styles.moduleLabel, { color: selected ? '#FFFFFF' : theme.colors.text }]}>{item.label}</Text>
            </Pressable>;
          })}
        </ScrollView>

        {notice ? <Text accessibilityRole="alert" style={[styles.notice, { color: theme.colors.tealDark, backgroundColor: theme.colors.surfaceTint }]}>{notice}</Text> : null}
        <ModulePreview id={active} cartCount={cartCount} setCartCount={setCartCount} approvedPreview={approvedPreview} setApprovedPreview={setApprovedPreview} onDemoAction={showNotice} />

        <View style={styles.footer}>
          <AppButton title="Create your Sellora account" onPress={() => router.push('/auth/signup')} />
          <AppButton title="Sign in" secondary onPress={() => router.push('/auth/login')} />
        </View>
      </View>
    </Screen>
  );
}

function ModulePreview({ id, cartCount, setCartCount, approvedPreview, setApprovedPreview, onDemoAction }: {
  id: ModuleId;
  cartCount: number;
  setCartCount: (value: number) => void;
  approvedPreview: boolean;
  setApprovedPreview: (value: boolean) => void;
  onDemoAction: (message: string) => void;
}) {
  const theme = useTheme();
  const palette = theme.colors;
  const section = modules.find((item) => item.id === id)!;
  const cardStyle = [styles.card, { backgroundColor: palette.surface, borderColor: palette.border }];

  return <View style={styles.preview}>
    <Text style={[styles.sectionTitle, { color: palette.text }]}>{section.label}</Text>
    {id === 'overview' ? <>
      <Text style={[styles.helper, { color: palette.muted }]}>A quick look at today’s sample store activity.</Text>
      <View style={styles.statsGrid}><Stat label="Today's sales" value="PKR 84,650" /><Stat label="Orders" value="38" /><Stat label="Products" value="246" /><Stat label="Low stock" value="7" warning /></View>
      <View style={cardStyle}><Text style={[styles.cardTitle, { color: palette.text }]}>Recent activity</Text><DemoRow title="Sale · SO-10482" detail="Today, 10:42 AM" value="PKR 4,250" /><DemoRow title="Purchase order · PO-238" detail="Awaiting delivery" value="PKR 28,900" /><DemoRow title="Stock alert · Arabica coffee" detail="Only 3 units left" value="Restock" /></View>
    </> : null}

    {id === 'pos' ? <View style={cardStyle}><Text style={[styles.helper, { color: palette.muted }]}>Try adding items. This sample cart resets when you exit.</Text><DemoRow title="Arabica coffee · 250 g" detail="SKU COF-025 · In stock" value="PKR 1,250" action="Add" onPress={() => { setCartCount(cartCount + 1); onDemoAction('Added to demo cart. No sale was saved.'); }} /><DemoRow title="Ceramic mug · White" detail="SKU MUG-110 · In stock" value="PKR 950" action="Add" onPress={() => { setCartCount(cartCount + 1); onDemoAction('Added to demo cart. No sale was saved.'); }} /><View style={[styles.cart, { backgroundColor: palette.surfaceTint }]}><Text style={[styles.cardTitle, { color: palette.text }]}>Demo cart · {cartCount} {cartCount === 1 ? 'item' : 'items'}</Text><Text style={[styles.helper, { color: palette.muted }]}>Checkout and payment are disabled in guest preview.</Text></View></View> : null}

    {id === 'products' ? <View style={cardStyle}><DemoRow title="Arabica coffee · 250 g" detail="COF-025 · Coffee" value="PKR 1,250" /><DemoRow title="Ceramic mug · White" detail="MUG-110 · Kitchen" value="PKR 950" /><DemoRow title="Canvas tote · Natural" detail="BAG-032 · Accessories" value="PKR 1,800" /><DemoRow title="Honey · 500 g" detail="GRC-051 · Grocery" value="PKR 1,100" /></View> : null}

    {id === 'inventory' ? <View style={cardStyle}><DemoRow title="Arabica coffee" detail="Main store · Shelf A2" value="3 left" warning /><DemoRow title="Ceramic mug" detail="Main store · Shelf B1" value="28 units" /><DemoRow title="Canvas tote" detail="Warehouse · Rack 04" value="16 units" /><DemoRow title="Honey · 500 g" detail="Main store · Shelf C3" value="Restock" warning /><Text style={[styles.helper, { color: palette.muted }]}>Inventory adjustments and transfers require an authorized account.</Text></View> : null}

    {id === 'customers' ? <View style={cardStyle}><DemoRow title="Ayesha Khan" detail="Gold member · 420 points" value="PKR 3,200 credit" /><DemoRow title="Hamza Ali" detail="Silver member · 180 points" value="PKR 0 due" /><DemoRow title="Sana Ahmed" detail="Regular · 65 points" value="PKR 850 due" /><Text style={[styles.helper, { color: palette.muted }]}>Customer details shown here are fictional demo data.</Text></View> : null}

    {id === 'purchases' ? <View style={cardStyle}><DemoRow title="PO-238 · Green Valley Supply" detail="Awaiting delivery · 5 items" value="PKR 28,900" /><DemoRow title="PO-237 · City Wholesale" detail="Partially received" value="PKR 16,400" /><DemoRow title="GRN-091 · Main store" detail="Received today" value="PKR 9,750" /><Text style={[styles.helper, { color: palette.muted }]}>Purchase orders, suppliers and delivery notes at a glance.</Text></View> : null}

    {id === 'expenses' ? <View style={cardStyle}><DemoRow title="Store supplies" detail="Today · Cash" value="PKR 2,400" /><DemoRow title="Delivery fuel" detail="Yesterday · Card" value="PKR 1,800" /><DemoRow title="Packaging" detail="Sep 24 · Cash" value="PKR 950" /><Stat label="This month" value="PKR 42,680" /></View> : null}

    {id === 'reports' ? <View style={cardStyle}><Text style={[styles.cardTitle, { color: palette.text }]}>Weekly sales · sample</Text><View style={styles.chart}>{[42, 68, 54, 84, 62, 96, 74].map((height, index) => <View key={index} style={styles.barColumn}><View style={[styles.bar, { height: height * 1.1, backgroundColor: index === 5 ? palette.teal : palette.surfaceTint }]} /><Text style={[styles.barLabel, { color: palette.muted }]}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}</Text></View>)}</View><DemoRow title="Gross sales" detail="This week" value="PKR 386,200" /><DemoRow title="Average order" detail="38 transactions" value="PKR 2,136" /></View> : null}

    {id === 'approvals' ? <View style={cardStyle}><Text style={[styles.helper, { color: palette.muted }]}>Preview the manager approval inbox with fictional requests.</Text><DemoRow title="Discount request · Sale SO-10475" detail="Requested by Ayesha · 10%" value={approvedPreview ? 'Approved · demo' : 'Pending'} action={approvedPreview ? 'Reset' : 'Preview'} onPress={() => { setApprovedPreview(!approvedPreview); onDemoAction(approvedPreview ? 'Demo approval reset. Nothing was saved.' : 'Preview approved locally. No account or request was changed.'); }} /><DemoRow title="Stock adjustment · Main store" detail="Requested by Hamza · +4 units" value="Pending" /><Text style={[styles.helper, { color: palette.muted }]}>Real account approvals only appear in the administrator panel.</Text></View> : null}

    {id === 'team' ? <View style={cardStyle}><DemoRow title="Mariam Noor" detail="Branch manager · On shift" value="09:00–17:00" /><DemoRow title="Ayesha Khan" detail="Cashier · On shift" value="10:00–18:00" /><DemoRow title="Hamza Ali" detail="Inventory manager · Off shift" value="Next: 14:00" /><Text style={[styles.helper, { color: palette.muted }]}>Roles, schedules and commissions are preview-only here.</Text></View> : null}

    {id === 'branches' ? <View style={cardStyle}><DemoRow title="Central Market" detail="Main branch · 5 team members" value="Active" /><DemoRow title="Main store" detail="Primary warehouse" value="128 SKUs" /><DemoRow title="North Outlet" detail="Branch · 3 team members" value="Active" /><DemoRow title="North stockroom" detail="Warehouse · 1,420 units" value="Active" /></View> : null}

    {id === 'settings' ? <View style={cardStyle}><DemoRow title="Appearance" detail="Light, dark and contrast themes" value="Preview" /><DemoRow title="Currency" detail="Display prices in your currency" value="PKR" /><DemoRow title="Offline & sync" detail="View local queued work" value="Available" /><DemoRow title="Security" detail="Password and device PIN controls" value="Protected" /><Text style={[styles.helper, { color: palette.muted }]}>Settings changes are disabled in guest mode.</Text></View> : null}

    {id === 'profile' ? <View style={cardStyle}><DemoRow title="Demo Store Owner" detail="owner@example.demo" value="Guest" /><DemoRow title="Phone & birthday" detail="Sample profile details" value="Preview" /><DemoRow title="Password" detail="Change password in your real profile" value="••••••••" /><DemoRow title="Device PIN" detail="Set or change a 4–6 digit PIN" value="Preview" /><Text style={[styles.helper, { color: palette.muted }]}>Profile editing, password changes and PIN setup require your own account. No guest credentials are stored.</Text></View> : null}
  </View>;
}

function Stat({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  const theme = useTheme();
  return <View style={[styles.stat, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[styles.statLabel, { color: theme.colors.muted }]}>{label}</Text><Text style={[styles.statValue, { color: warning ? theme.colors.warning : theme.colors.text }]}>{value}</Text></View>;
}

function DemoRow({ title, detail, value, action, warning = false, onPress }: { title: string; detail: string; value: string; action?: string; warning?: boolean; onPress?: () => void }) {
  const theme = useTheme();
  return <View style={[styles.row, { borderBottomColor: theme.colors.border }]}><View style={styles.rowText}><Text style={[styles.rowTitle, { color: theme.colors.text }]}>{title}</Text><Text style={[styles.rowDetail, { color: theme.colors.muted }]}>{detail}</Text></View>{action && onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={[styles.action, { backgroundColor: theme.colors.surfaceTint }]}><Text style={[styles.actionText, { color: theme.colors.tealDark }]}>{action}</Text></Pressable> : <Text style={[styles.rowValue, { color: warning ? theme.colors.warning : theme.colors.text }]}>{value}</Text>}</View>;
}

const styles = StyleSheet.create({
  page: { paddingBottom: 24 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', borderWidth: 1, borderColor: colors.border },
  menuIcon: { fontSize: 19, fontWeight: '800' },
  exit: { fontWeight: '800', padding: 8 },
  demoBanner: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 18 },
  demoLabel: { fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  disclaimer: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  heading: { fontSize: 25, fontWeight: '900', marginTop: 22 },
  moduleRail: { gap: 8, paddingVertical: 14 },
  moduleChip: { minHeight: 42, borderWidth: 1, borderRadius: 22, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  moduleIcon: { fontSize: 15, fontWeight: '900' },
  moduleLabel: { fontSize: 12, fontWeight: '800' },
  preview: { marginTop: 4 },
  sectionTitle: { fontWeight: '900', fontSize: 20, marginBottom: 5 },
  helper: { fontSize: 13, lineHeight: 20, marginTop: 4, marginBottom: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginVertical: 12 },
  stat: { width: '48%', minHeight: 74, borderWidth: 1, borderRadius: 13, padding: 12, flexGrow: 1 },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 17, fontWeight: '900', marginTop: 6 },
  card: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 8, marginTop: 9 },
  cardTitle: { fontSize: 15, fontWeight: '900', marginVertical: 10 },
  row: { minHeight: 61, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 13, fontWeight: '800' },
  rowDetail: { fontSize: 11, marginTop: 4 },
  rowValue: { fontSize: 12, fontWeight: '800', textAlign: 'right', maxWidth: '39%' },
  action: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9 },
  actionText: { fontWeight: '900', fontSize: 12 },
  cart: { borderRadius: 11, padding: 12, marginVertical: 10 },
  chart: { height: 130, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', marginVertical: 15 },
  barColumn: { alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  bar: { width: 22, borderRadius: 6 },
  barLabel: { fontSize: 10, fontWeight: '700' },
  notice: { fontSize: 13, fontWeight: '700', padding: 10, borderRadius: 10, overflow: 'hidden', marginTop: 4 },
  footer: { marginTop: 18 },
});

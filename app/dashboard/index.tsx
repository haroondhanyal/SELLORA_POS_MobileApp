import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { canManageRoles, canManageUsers } from '@/services/permissions';
import { clearDevicePin } from '@/services/pin';
import { requireSupabase } from '@/services/supabase';
import { colors } from '@/theme/colors';

/** First approved screen after sign-in; links users to the features they can access. */
export default function DashboardScreen() {
  const { profile, permissionCodes, locked, session } = useAuth();

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!profile || profile.approval_status !== 'approved') {
    return <Redirect href="/auth/pending-approval" />;
  }

  async function signOut() {
    try {
      await clearDevicePin();
      await requireSupabase().auth.signOut();
      router.replace('/welcome');
    } catch (error) {
      Alert.alert('Could not sign out', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  const showUserManagement = canManageUsers(profile, permissionCodes);
  const showRoleManagement = canManageRoles(profile, permissionCodes);
  const canViewProducts = permissionCodes.includes('products.view') || permissionCodes.includes('products.manage');
  const canViewInventory = permissionCodes.includes('inventory.view') || permissionCodes.includes('inventory.manage');
  const canCreateSales = permissionCodes.includes('sales.create');
  const canViewCustomers = permissionCodes.includes('customers.view') || permissionCodes.includes('customers.manage');
  const canManageInventory = permissionCodes.includes('inventory.manage');
  const canManageBranches = permissionCodes.includes('branches.manage');
  const canManageWarehouses = permissionCodes.includes('warehouses.manage');
  const canViewExpenses = permissionCodes.includes('expenses.view') || permissionCodes.includes('expenses.manage');

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.hello}>Hello, {profile.full_name || 'there'}.</Text>
        <Text style={styles.body}>
          Your Sellora workspace is ready. Open the modules your role can use below.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Your access</Text>
          <Text style={styles.value}>{profile.role.replaceAll('_', ' ')}</Text>
          <Text style={styles.status}>Approved account</Text>
        </View>

        {showUserManagement ? (
          <AppButton title="Manage users & approvals" onPress={() => router.push('/users')} />
        ) : null}
        {showRoleManagement ? (
          <AppButton title="Manage role permissions" onPress={() => router.push('/roles')} />
        ) : null}
        {canCreateSales ? <AppButton title="Open point of sale" onPress={() => router.push('/pos')} /> : null}
        {canViewProducts ? <AppButton title="Products & catalogue" onPress={() => router.push('/products')} secondary /> : null}
        {canViewInventory ? <AppButton title="View inventory" onPress={() => router.push('/inventory')} secondary /> : null}
        {canViewCustomers ? <AppButton title="Customers" onPress={() => router.push('/customers')} secondary /> : null}
        {canManageBranches ? <AppButton title="Branches" onPress={() => router.push('/branches')} secondary /> : null}
        {canManageWarehouses ? <AppButton title="Warehouses" onPress={() => router.push('/warehouses')} secondary /> : null}
        {canManageInventory ? <AppButton title="Suppliers" onPress={() => router.push('/suppliers')} secondary /> : null}
        {canManageInventory ? <AppButton title="Stock transfers" onPress={() => router.push('/transfers')} secondary /> : null}
        {canManageInventory ? <AppButton title="Purchases & GRNs" onPress={() => router.push('/purchases')} secondary /> : null}
        {permissionCodes.includes('returns.manage') ? <AppButton title="Returns & refunds" onPress={() => router.push('/returns')} secondary /> : null}
        {canViewExpenses ? <AppButton title="Expenses" onPress={() => router.push('/expenses')} secondary /> : null}
        {permissionCodes.includes('customers.credit.manage') ? <AppButton title="Customer credit payments" onPress={() => router.push('/customers/payments')} secondary /> : null}
        {permissionCodes.includes('shifts.manage') ? <AppButton title="My shift & cash drawer" onPress={() => router.push('/shifts')} secondary /> : null}
        {permissionCodes.includes('targets.manage') || permissionCodes.includes('sales.view_own') ? <AppButton title="Sales targets" onPress={() => router.push('/targets')} secondary /> : null}
        {permissionCodes.includes('commissions.view') ? <AppButton title="Commissions" onPress={() => router.push('/commissions')} secondary /> : null}
        {permissionCodes.includes('approvals.view') ? <AppButton title="Review approvals" onPress={() => router.push('/approvals')} secondary /> : null}
        {permissionCodes.includes('approvals.request') ? <AppButton title="Request approval" onPress={() => router.push('/approvals/request')} secondary /> : null}
        {permissionCodes.includes('notifications.view') ? <AppButton title="Notifications" onPress={() => router.push('/notifications')} secondary /> : null}
        {permissionCodes.includes('reports.view') || permissionCodes.includes('audit.view') ? <AppButton title="Reports & audit" onPress={() => router.push('/reports')} secondary /> : null}
        <AppButton title="Offline & sync queue" onPress={() => router.push('/settings/sync')} secondary />
        {permissionCodes.includes('reports.view') || permissionCodes.includes('sales.view_own') ? <AppButton title="Sellora Copilot" onPress={() => router.push('/ai')} secondary /> : null}
        {profile.role === 'admin' ? <AppButton title="Business backup" onPress={() => router.push('/settings/backup')} secondary /> : null}
        <AppButton title="Currency settings" onPress={() => router.push('/settings/currency')} secondary />
        <AppButton title="Edit profile & PIN" onPress={() => router.push('/profile')} secondary />

        <View style={styles.bottom}>
          <AppButton title="Sign out" secondary onPress={signOut} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  hello: { color: colors.navy, fontSize: 30, fontWeight: '800', marginTop: 36 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 10 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginTop: 28, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.muted, fontSize: 13 },
  value: { color: colors.navy, fontSize: 20, fontWeight: '800', textTransform: 'capitalize', marginTop: 8 },
  status: { color: colors.success, fontSize: 13, marginTop: 8, fontWeight: '700' },
  bottom: { flex: 1, justifyContent: 'flex-end' },
});

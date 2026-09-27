import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { OptionPicker } from '@/components/OptionPicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { listBranches, type Branch } from '@/services/branches';
import { listSuppliers, type Supplier } from '@/services/operations';
import { colors } from '@/theme/colors';

/** Phase 7 supplier list scoped to the branch selected by the user. */
export default function SuppliersScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(profile?.primary_branch_id ?? null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const canManage = permissionCodes.includes('inventory.manage');

  useEffect(() => {
    listBranches().then((available) => {
      setBranches(available);
      setBranchId((current) => current ?? profile?.primary_branch_id ?? available[0]?.id ?? null);
    }).catch((error) => Alert.alert('Could not load branches', error instanceof Error ? error.message : 'Please try again.'));
  }, []);
  useEffect(() => {
    if (!branchId) return;
    setLoading(true);
    listSuppliers(branchId).then(setSuppliers).catch((error) => Alert.alert('Could not load suppliers', error instanceof Error ? error.message : 'Please try again.')).finally(() => setLoading(false));
  }, [branchId]);

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Suppliers</Text>
        <Text style={styles.help}>Supplier records belong to one branch.</Text>
        <OptionPicker label="Branch" value={branchId} options={branches.map((branch) => ({ id: branch.id, label: `${branch.name} · ${branch.code}` }))} onChange={setBranchId} />
        {canManage ? <AppButton title="Add supplier" onPress={() => router.push('/suppliers/add')} /> : null}
        {loading ? <Text style={styles.help}>Loading suppliers…</Text> : null}
        {suppliers.map((supplier) => <View key={supplier.id} style={styles.card}>
          <Text style={styles.name}>{supplier.name}</Text>
          {supplier.company_name ? <Text style={styles.help}>{supplier.company_name}</Text> : null}
          {supplier.phone ? <Text style={styles.help}>{supplier.phone}</Text> : null}
          {supplier.email ? <Text style={styles.help}>{supplier.email}</Text> : null}
        </View>)}
        {!loading && suppliers.length === 0 ? <Text style={styles.empty}>No suppliers in this branch yet.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 }, help: { color: colors.muted, lineHeight: 21, marginTop: 6 }, card: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginTop: 10 }, name: { color: colors.navy, fontWeight: '800' }, empty: { color: colors.muted, textAlign: 'center', marginTop: 30 } });

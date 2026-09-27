import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { OptionPicker } from '@/components/OptionPicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { createWarehouse, listBranches, listWarehousesForBranch, type Branch, type Warehouse } from '@/services/branches';
import { requireSupabase } from '@/services/supabase';
import { colors } from '@/theme/colors';

type ManagerOption = { id: string; label: string };

/** Phase 7 warehouse setup with branch, manager and a single primary warehouse. */
export default function WarehousesScreen() {
  const { profile, session, locked } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [branchId, setBranchId] = useState<string | null>(profile?.primary_branch_id ?? null);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [busy, setBusy] = useState(false);
  const isAdmin = profile?.role === 'admin' && profile.approval_status === 'approved';

  async function loadBranches() {
    try {
      const available = await listBranches();
      setBranches(available);
      if (!branchId && available.length) setBranchId(profile?.primary_branch_id ?? available[0].id);
    } catch (error) { Alert.alert('Could not load branches', error instanceof Error ? error.message : 'Please try again.'); }
  }
  async function loadWarehouses(selectedBranch: string) {
    try {
      const [locations, peopleResult] = await Promise.all([
        listWarehousesForBranch(selectedBranch),
        requireSupabase().from('profiles').select('id, full_name, role').eq('approval_status', 'approved').eq('primary_branch_id', selectedBranch).order('full_name'),
      ]);
      if (peopleResult.error) throw peopleResult.error;
      setWarehouses(locations);
      setIsPrimary(locations.length === 0);
      setManagers((peopleResult.data ?? []).map((person) => ({ id: person.id, label: `${person.full_name} · ${person.role.replaceAll('_', ' ')}` })));
    } catch (error) { Alert.alert('Could not load warehouse details', error instanceof Error ? error.message : 'Please try again.'); }
  }

  useEffect(() => { void loadBranches(); }, []);
  useEffect(() => { if (branchId) void loadWarehouses(branchId); }, [branchId]);

  async function save() {
    if (!branchId || name.trim().length < 2) { Alert.alert('Check warehouse details', 'Choose a branch and enter a warehouse name.'); return; }
    setBusy(true);
    try {
      await createWarehouse({ branchId, name, address, managerId, isPrimary });
      setName(''); setAddress(''); setManagerId(null);
      await loadWarehouses(branchId);
    } catch (error) { Alert.alert('Could not create warehouse', error instanceof Error ? error.message : 'Check branch and admin access.'); }
    finally { setBusy(false); }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Warehouses</Text>
        <Text style={styles.help}>Warehouses hold stock within a branch. A primary warehouse is used by POS.</Text>
        <OptionPicker label="Branch" value={branchId} options={branches.map((branch) => ({ id: branch.id, label: `${branch.name} · ${branch.code}` }))} onChange={setBranchId} />
        {isAdmin ? <>
          <FormField label="Warehouse name" value={name} onChangeText={setName} placeholder="Main stock room" />
          <FormField label="Address (optional)" value={address} onChangeText={setAddress} multiline />
          <OptionPicker label="Warehouse manager (optional)" value={managerId} options={managers} onChange={setManagerId} allowNone />
          <View style={styles.switchRow}><Text style={styles.name}>Primary warehouse</Text><Switch value={isPrimary} onValueChange={setIsPrimary} trackColor={{ true: colors.teal }} /></View>
          <AppButton title="Create warehouse" onPress={save} busy={busy} disabled={!branchId} />
        </> : <Text style={styles.help}>Only an approved administrator can create warehouses.</Text>}
        {warehouses.map((warehouse) => <View key={warehouse.id} style={styles.card}><Text style={styles.name}>{warehouse.name}{warehouse.is_primary ? ' · Primary' : ''}</Text><Text style={styles.help}>{warehouse.address ?? 'No address set'}</Text></View>)}
        {branchId && warehouses.length === 0 ? <Text style={styles.empty}>No warehouse in this branch yet.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  help: { color: colors.muted, lineHeight: 21, marginTop: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10 },
  card: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginTop: 10 },
  name: { color: colors.navy, fontWeight: '800' }, empty: { color: colors.muted, textAlign: 'center', padding: 22 },
});

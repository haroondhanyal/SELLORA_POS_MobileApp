import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { listBranches, listWarehousesForBranch, type Branch, type Warehouse } from '@/services/branches';
import { listStockTransfers, updateStockTransfer, type StockTransfer } from '@/services/operations';
import { colors } from '@/theme/colors';

/** Phase 7 transfer state board; dispatch and receipt each move stock atomically. */
export default function TransfersScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canManage = permissionCodes.includes('inventory.manage');
  const isAdmin = profile?.role === 'admin' && profile.approval_status === 'approved';

  async function load() {
    setLoading(true);
    try {
      const [branchRows, transferRows] = await Promise.all([listBranches(), listStockTransfers()]);
      const warehouseRows = await Promise.all(branchRows.map((branch) => listWarehousesForBranch(branch.id)));
      setBranches(branchRows); setWarehouses(warehouseRows.flat()); setTransfers(transferRows);
    } catch (error) { Alert.alert('Could not load transfers', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function advance(transfer: StockTransfer, nextStatus: string) {
    setBusyId(transfer.id);
    try { await updateStockTransfer(transfer.id, nextStatus); await load(); }
    catch (error) { Alert.alert('Could not update transfer', error instanceof Error ? error.message : 'Check your branch access and try again.'); }
    finally { setBusyId(null); }
  }

  function branchName(id: string) { return branches.find((branch) => branch.id === id)?.name ?? `Branch ${id.slice(0, 6)}`; }
  function warehouseName(id: string) { return warehouses.find((warehouse) => warehouse.id === id)?.name ?? `Warehouse ${id.slice(0, 6)}`; }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Stock transfers</Text>
        <Text style={styles.help}>Track each branch-to-branch move from request through receipt.</Text>
        {canManage ? <AppButton title="Request a transfer" onPress={() => router.push('/transfers/add')} /> : null}
        {loading ? <Text style={styles.help}>Loading transfers…</Text> : null}
        {transfers.map((transfer) => {
          const canManageSource = isAdmin || branches.some((branch) => branch.id === transfer.from_branch_id);
          const canManageTarget = isAdmin || branches.some((branch) => branch.id === transfer.to_branch_id);
          return <View key={transfer.id} style={styles.card}>
          <Text style={styles.name}>{transfer.transfer_number}</Text>
          <Text style={styles.status}>{transfer.status.replaceAll('_', ' ')}</Text>
          <Text style={styles.help}>{branchName(transfer.from_branch_id)} · {warehouseName(transfer.from_warehouse_id)}</Text>
          <Text style={styles.help}>→ {branchName(transfer.to_branch_id)} · {warehouseName(transfer.to_warehouse_id)}</Text>
          {transfer.note ? <Text style={styles.note}>{transfer.note}</Text> : null}
          {canManage && canManageSource && transfer.status === 'requested' ? <View style={styles.actions}><AppButton title="Approve" onPress={() => advance(transfer, 'approved')} busy={busyId === transfer.id} /><AppButton title="Reject" secondary onPress={() => advance(transfer, 'rejected')} /></View> : null}
          {canManage && canManageSource && transfer.status === 'approved' ? <AppButton title="Dispatch stock" onPress={() => advance(transfer, 'dispatched')} busy={busyId === transfer.id} /> : null}
          {canManage && (canManageSource || canManageTarget) && transfer.status === 'dispatched' ? <AppButton title="Mark in transit" onPress={() => advance(transfer, 'in_transit')} busy={busyId === transfer.id} /> : null}
          {canManage && canManageTarget && transfer.status === 'in_transit' ? <AppButton title="Receive stock" onPress={() => advance(transfer, 'received')} busy={busyId === transfer.id} /> : null}
        </View>;
        })}
        {!loading && transfers.length === 0 ? <Text style={styles.empty}>No transfer requests are visible for your assigned branches.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 }, help: { color: colors.muted, lineHeight: 21, marginTop: 6 }, card: { borderWidth: 1, borderColor: colors.border, backgroundColor: 'white', borderRadius: 14, padding: 15, marginTop: 12 }, name: { color: colors.navy, fontWeight: '800' }, status: { color: colors.tealDark, fontWeight: '800', textTransform: 'capitalize', marginTop: 5 }, note: { color: colors.text, marginTop: 8 }, actions: { flexDirection: 'row', gap: 9 } , empty: { color: colors.muted, textAlign: 'center', marginTop: 28 } });

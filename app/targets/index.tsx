import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { OptionPicker } from '@/components/OptionPicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { listBranchSalesAgents } from '@/services/customers';
import { saveCommissionRule, saveSalesTarget } from '@/services/workforce';
import { requireDatabase } from '@/services/database';
import { colors } from '@/theme/colors';

type SalesTarget = { id: string; agent_id: string; period_type: string; period_start: string; target_amount: number; profiles?: { full_name: string } | null };
type TargetSale = { sales_agent_id: string; total: number; created_at: string; status: string };

/** Assigns targets and shows each agent's actual progress for that target period. */
export default function TargetsScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const { formatMoney } = useCurrency();
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [period, setPeriod] = useState('monthly');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [targets, setTargets] = useState<SalesTarget[]>([]);
  const [sales, setSales] = useState<TargetSale[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const branchId = profile?.primary_branch_id;
    if (!branchId) return;
    try {
      const [people, targetResult] = await Promise.all([
        listBranchSalesAgents(branchId),
        requireDatabase().from('sales_targets')
          .select('id,agent_id,period_type,period_start,target_amount,profiles!sales_targets_agent_id_fkey(full_name)')
          .eq('branch_id', branchId).order('period_start', { ascending: false }).limit(100),
      ]);
      if (targetResult.error) throw targetResult.error;
      setAgents(people);
      setTargets((targetResult.data ?? []) as unknown as SalesTarget[]);
      if (!agentId && people[0]) setAgentId(people[0].id);
      const earliest = targetResult.data?.reduce((start, target) => target.period_start < start ? target.period_start : start, targetResult.data[0]?.period_start ?? localDate(new Date()));
      if (earliest) {
        const salesResult = await requireDatabase().from('sales').select('sales_agent_id,total,created_at,status')
          .eq('branch_id', branchId).gte('created_at', new Date(`${earliest}T00:00:00`).toISOString()).limit(5000);
        if (salesResult.error) throw salesResult.error;
        setSales((salesResult.data ?? []) as TargetSale[]);
      } else setSales([]);
    } catch (error) {
      Alert.alert('Could not load targets', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [profile?.primary_branch_id]);

  useEffect(() => { void load(); }, [load]);

  async function assignTarget() {
    const value = Number(amount);
    const today = new Date();
    const start = period === 'daily' ? localDate(today)
      : period === 'weekly' ? localDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay()))
      : `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
    if (!profile?.primary_branch_id || !agentId || !Number.isFinite(value) || value <= 0) {
      Alert.alert('Check target', 'Choose a sales agent and enter a target amount.'); return;
    }
    setBusy(true);
    try {
      await saveSalesTarget({ branchId: profile.primary_branch_id, agentId, periodType: period, periodStart: start, amount: value });
      setAmount(''); await load();
    } catch (error) { Alert.alert('Could not save target', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }

  async function updateCommission() {
    const value = Number(rate);
    if (!profile?.primary_branch_id || !Number.isFinite(value) || value < 0 || value > 100) {
      Alert.alert('Check commission rate', 'Enter a percentage from 0 to 100.'); return;
    }
    setBusy(true);
    try {
      await saveCommissionRule(profile.primary_branch_id, 'Branch sales commission', value);
      setRate(''); Alert.alert('Commission updated', 'New sales will use this percentage.');
    } catch (error) { Alert.alert('Could not save commission', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!profile?.primary_branch_id) return <Screen><Text>Assign a branch before using targets.</Text></Screen>;
  const canManage = permissionCodes.includes('targets.manage');

  return (
    <Screen><View style={styles.page}>
      <AppHeader profile={profile} />
      <Text style={styles.title}>Sales targets</Text>
      {canManage ? <>
        <OptionPicker label="Sales agent" value={agentId} options={agents.map((item) => ({ id: item.id, label: item.full_name }))} onChange={setAgentId} />
        <OptionPicker label="Target period" value={period} options={['daily', 'weekly', 'monthly'].map((id) => ({ id, label: id }))} onChange={(id) => { if (id) setPeriod(id); }} />
        <FormField label="Target amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <AppButton title="Assign target" onPress={assignTarget} busy={busy} />
        <Text style={styles.section}>Commission for future sales</Text>
        <FormField label="Commission percentage" value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
        <AppButton title="Save commission rate" onPress={updateCommission} secondary busy={busy} />
      </> : null}
      {targets.map((target) => {
        const [year, month, day] = target.period_start.split('-').map(Number);
        const start = new Date(year, month - 1, day);
        const end = new Date(start);
        if (target.period_type === 'daily') end.setDate(end.getDate() + 1);
        if (target.period_type === 'weekly') end.setDate(end.getDate() + 7);
        if (target.period_type === 'monthly') end.setMonth(end.getMonth() + 1);
        const actual = sales.filter((sale) => sale.status === 'completed' && sale.sales_agent_id === target.agent_id && new Date(sale.created_at) >= start && new Date(sale.created_at) < end).reduce((sum, sale) => sum + Number(sale.total), 0);
        const progress = Math.min(100, Math.round(actual / Number(target.target_amount) * 100));
        return <View key={target.id} style={styles.card}>
          <Text style={styles.name}>{target.profiles?.full_name ?? 'Sales agent'} · {target.period_type}</Text>
          <Text style={styles.help}>Period starts {target.period_start}</Text>
          <Text style={styles.amount}>{formatMoney(actual)} / {formatMoney(Number(target.target_amount))} · {progress}%</Text>
          <View style={styles.track}><View style={[styles.progress, { width: `${progress}%` }]} /></View>
        </View>;
      })}
      {!targets.length ? <Text style={styles.help}>No targets assigned yet.</Text> : null}
    </View></Screen>
  );
}

function pad(value: number) { return String(value).padStart(2, '0'); }
function localDate(value: Date) { return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`; }

const styles = StyleSheet.create({
  page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 27, fontWeight: '800', marginTop: 24 },
  section: { color: colors.navy, fontWeight: '800', fontSize: 18, marginTop: 26 },
  card: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 15, marginTop: 12 },
  name: { color: colors.navy, fontWeight: '800' }, help: { color: colors.muted, marginTop: 6 }, amount: { color: colors.tealDark, fontWeight: '800', marginTop: 7 },
  track: { height: 8, backgroundColor: colors.border, borderRadius: 8, marginTop: 10, overflow: 'hidden' },
  progress: { height: 8, backgroundColor: colors.teal, borderRadius: 8 },
});

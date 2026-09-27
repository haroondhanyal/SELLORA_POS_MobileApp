import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { closeShift, getMyOpenShift, openShift } from '@/services/workforce';
import { useCurrency } from '@/providers/CurrencyProvider';
import { colors } from '@/theme/colors';

/** Employee opens/closes a shift and records counted drawer cash at close. */
export default function ShiftsScreen() {
  const { profile, permissionCodes, session, locked } = useAuth(); const { formatMoney } = useCurrency();
  const [shift, setShift] = useState<{ id: string; opened_at: string; opening_cash: number } | null>(null);
  const [opening, setOpening] = useState('0'); const [actual, setActual] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  async function load() { if (!session?.user.id) return; try { setShift(await getMyOpenShift(session.user.id)); } catch (error) { Alert.alert('Could not load shift', error instanceof Error ? error.message : 'Please try again.'); } }
  useEffect(() => { void load(); }, [session?.user.id]);
  async function start() { const amount=Number(opening); if (!profile?.primary_branch_id || !Number.isFinite(amount) || amount<0) { Alert.alert('Check opening cash', 'Enter a valid non-negative amount.'); return; } setBusy(true); try { await openShift(profile.primary_branch_id,amount); await load(); } catch(error) { Alert.alert('Could not open shift',error instanceof Error?error.message:'Please try again.'); } finally { setBusy(false); } }
  async function finish() { const amount=Number(actual); if (!shift || !Number.isFinite(amount)||amount<0) { Alert.alert('Check counted cash','Enter the cash counted in the drawer.'); return; } setBusy(true); try { await closeShift(shift.id,amount,note); setShift(null); setActual(''); Alert.alert('Shift closed','Expected cash and drawer difference have been saved.'); } catch(error) { Alert.alert('Could not close shift',error instanceof Error?error.message:'Please try again.'); } finally { setBusy(false); } }
  if(locked)return <Redirect href="/auth/pin-login"/>; if(!session)return <Redirect href="/auth/login"/>;
  if(!permissionCodes.includes('shifts.manage'))return <Screen><Text>Access denied</Text></Screen>;
  return <Screen><View style={styles.page}><AppHeader profile={profile}/><Text style={styles.title}>My shift & cash drawer</Text>
    {shift ? <><View style={styles.card}><Text style={styles.name}>Shift is open</Text><Text style={styles.help}>Started {new Date(shift.opened_at).toLocaleString()}</Text><Text style={styles.help}>Opening cash: {formatMoney(Number(shift.opening_cash))}</Text></View><FormField label="Counted cash at close" value={actual} onChangeText={setActual} keyboardType="decimal-pad"/><FormField label="Close note (optional)" value={note} onChangeText={setNote} multiline/><AppButton title="Close shift" onPress={finish} busy={busy}/></> : <><Text style={styles.help}>Open a shift to start tracking your cash drawer.</Text><FormField label="Opening cash" value={opening} onChangeText={setOpening} keyboardType="decimal-pad"/><AppButton title="Open shift" onPress={start} busy={busy}/></>}
  </View></Screen>;
}
const styles=StyleSheet.create({page:{paddingBottom:30},title:{color:colors.navy,fontSize:27,fontWeight:'800',marginTop:24},help:{color:colors.muted,marginTop:8,lineHeight:21},card:{backgroundColor:'white',borderWidth:1,borderColor:colors.border,borderRadius:14,padding:15,marginTop:18},name:{color:colors.navy,fontWeight:'800'}});

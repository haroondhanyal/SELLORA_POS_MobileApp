import { useEffect, useState } from 'react';
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
import { requireSupabase } from '@/services/supabase';
import { colors } from '@/theme/colors';

/** Managers assign an agent target and the branch commission rate for future sales. */
export default function TargetsScreen() {
  const { profile, permissionCodes, session, locked }=useAuth(); const {formatMoney}=useCurrency();
  const [agents,setAgents]=useState<{id:string;full_name:string}[]>([]); const [agentId,setAgentId]=useState<string|null>(null);
  const [period,setPeriod]=useState('monthly'); const [amount,setAmount]=useState(''); const [rate,setRate]=useState(''); const [rows,setRows]=useState<{id:string;agent_id:string;period_type:string;period_start:string;target_amount:number;profiles?:{full_name:string}|null}[]>([]); const [busy,setBusy]=useState(false);
  async function load(){if(!profile?.primary_branch_id)return;try{const [people,targets]=await Promise.all([listBranchSalesAgents(profile.primary_branch_id),requireSupabase().from('sales_targets').select('id,agent_id,period_type,period_start,target_amount,profiles!sales_targets_agent_id_fkey(full_name)').eq('branch_id',profile.primary_branch_id).order('period_start',{ascending:false}).limit(100)]);setAgents(people);if(!agentId&&people[0])setAgentId(people[0].id);if(targets.error)throw targets.error;setRows((targets.data??[]) as unknown as typeof rows);}catch(error){Alert.alert('Could not load targets',error instanceof Error?error.message:'Please try again.');}}
  useEffect(()=>{void load();},[profile?.primary_branch_id]);
  async function saveTarget(){const value=Number(amount);if(!profile?.primary_branch_id||!agentId||!Number.isFinite(value)||value<=0){Alert.alert('Check target','Choose a sales agent and enter a target amount.');return;}setBusy(true);try{const today=new Date();const start=period==='daily'?today.toISOString().slice(0,10):period==='weekly'?new Date(today.getFullYear(),today.getMonth(),today.getDate()-today.getDay()).toISOString().slice(0,10):`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`;await saveSalesTarget({branchId:profile.primary_branch_id,agentId,periodType:period,periodStart:start,amount:value});setAmount('');await load();}catch(error){Alert.alert('Could not save target',error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}}
  async function saveRate(){const value=Number(rate);if(!profile?.primary_branch_id||!Number.isFinite(value)||value<0||value>100){Alert.alert('Check commission rate','Enter a percentage from 0 to 100.');return;}setBusy(true);try{await saveCommissionRule(profile.primary_branch_id,'Branch sales commission',value);Alert.alert('Commission updated','Future sales will use this percentage.');}catch(error){Alert.alert('Could not save commission',error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}}
  if(locked)return <Redirect href="/auth/pin-login"/>;if(!session)return <Redirect href="/auth/login"/>;if(!profile?.primary_branch_id)return <Screen><Text>Assign a branch before using targets.</Text></Screen>;
  const canManage=permissionCodes.includes('targets.manage');
  return <Screen><View style={styles.page}><AppHeader profile={profile}/><Text style={styles.title}>Sales targets</Text>{canManage?<><OptionPicker label="Sales agent" value={agentId} options={agents.map((item)=>({id:item.id,label:item.full_name}))} onChange={setAgentId}/><OptionPicker label="Target period" value={period} options={['daily','weekly','monthly'].map((id)=>({id,label:id}))} onChange={(id)=>id&&setPeriod(id)}/><FormField label="Target amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/><AppButton title="Assign target" onPress={saveTarget} busy={busy}/><Text style={styles.section}>Commission for future sales</Text><FormField label="Commission percentage" value={rate} onChangeText={setRate} keyboardType="decimal-pad"/><AppButton title="Save commission rate" onPress={saveRate} secondary busy={busy}/></>:null}
    {rows.map((row)=><View key={row.id} style={styles.card}><Text style={styles.name}>{row.profiles?.full_name??'Sales agent'} · {row.period_type}</Text><Text style={styles.help}>From {row.period_start}</Text><Text style={styles.amount}>{formatMoney(Number(row.target_amount))}</Text></View>)}{!rows.length?<Text style={styles.help}>No targets assigned yet.</Text>:null}</View></Screen>;
}
const styles=StyleSheet.create({page:{paddingBottom:30},title:{color:colors.navy,fontSize:27,fontWeight:'800',marginTop:24},section:{color:colors.navy,fontWeight:'800',fontSize:18,marginTop:26},card:{backgroundColor:'white',borderWidth:1,borderColor:colors.border,borderRadius:14,padding:15,marginTop:12},name:{color:colors.navy,fontWeight:'800'},help:{color:colors.muted,marginTop:6},amount:{color:colors.tealDark,fontWeight:'800',marginTop:6}});

import { useEffect,useState } from 'react';
import { Alert,StyleSheet,Text,View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { listCommissions } from '@/services/workforce';
import { colors } from '@/theme/colors';

/** Shows commission snapshots for the current agent or authorized branch managers. */
export default function CommissionsScreen(){const{profile,permissionCodes,session,locked}=useAuth();const{formatMoney}=useCurrency();const[rows,setRows]=useState<any[]>([]);useEffect(()=>{if(!profile?.primary_branch_id||!permissionCodes.includes('commissions.view'))return;listCommissions(profile.primary_branch_id).then(setRows).catch((error)=>Alert.alert('Could not load commissions',error.message));},[profile?.primary_branch_id,permissionCodes]);if(locked)return<Redirect href="/auth/pin-login"/>;if(!session)return<Redirect href="/auth/login"/>;return<Screen><View style={styles.page}><AppHeader profile={profile}/><Text style={styles.title}>Commissions</Text>{rows.map((row)=><View key={row.id} style={styles.card}><Text style={styles.name}>{row.profiles?.full_name??'Sales agent'}</Text><Text style={styles.help}>Sale: {formatMoney(Number(row.sale_total))}</Text><Text style={styles.amount}>Commission: {formatMoney(Number(row.commission_amount))}</Text></View>)}{!rows.length?<Text style={styles.help}>No commission records yet. An active branch commission rule applies to future sales.</Text>:null}</View></Screen>;}
const styles=StyleSheet.create({page:{paddingBottom:30},title:{color:colors.navy,fontSize:27,fontWeight:'800',marginTop:24},card:{backgroundColor:'white',borderWidth:1,borderColor:colors.border,borderRadius:14,padding:15,marginTop:12},name:{color:colors.navy,fontWeight:'800'},help:{color:colors.muted,marginTop:6},amount:{color:colors.tealDark,fontWeight:'800',marginTop:6}});

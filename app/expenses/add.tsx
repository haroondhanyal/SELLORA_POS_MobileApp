import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { createExpense } from '@/services/operations';
import { colors } from '@/theme/colors';

const categories = ['rent','electricity','salary','internet','transport','marketing','maintenance','other'];
const methods = ['cash','card','bank_transfer','jazzcash','easypaisa'];
/** Captures a real branch expense and persists it under the current author. */
export default function AddExpenseScreen() {
  const { profile, permissionCodes, session, locked } = useAuth(); const [category, setCategory] = useState(categories[0]); const [description, setDescription] = useState(''); const [amount, setAmount] = useState(''); const [method, setMethod] = useState(methods[0]); const [busy, setBusy] = useState(false);
  async function save() { const value = Number(amount); if (!profile?.primary_branch_id || description.trim().length < 2 || !Number.isFinite(value) || value <= 0) { Alert.alert('Check expense details', 'Enter a description and an amount greater than zero.'); return; } setBusy(true); try { await createExpense({ branchId: profile.primary_branch_id, category, description, amount: value, method }); Alert.alert('Expense saved', 'The branch expense has been recorded.', [{ text: 'Done', onPress: () => router.replace('/expenses') }]); } catch (error) { Alert.alert('Could not save expense', error instanceof Error ? error.message : 'Please try again.'); } finally { setBusy(false); } }
  if (locked) return <Redirect href="/auth/pin-login" />; if (!session) return <Redirect href="/auth/login" />; if (!permissionCodes.includes('expenses.manage')) return <Screen><Text>Access denied</Text></Screen>;
  return <Screen><View style={styles.page}><AppHeader profile={profile} /><Text style={styles.title}>Record expense</Text><Text style={styles.label}>Category</Text><View style={styles.row}>{categories.map((value) => <Pressable key={value} style={[styles.choice, value===category && styles.selected]} onPress={() => setCategory(value)}><Text style={styles.choiceText}>{value}</Text></Pressable>)}</View><FormField label="Description" value={description} onChangeText={setDescription} /><FormField label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /><Text style={styles.label}>Paid by</Text><View style={styles.row}>{methods.map((value) => <Pressable key={value} style={[styles.choice, value===method && styles.selected]} onPress={() => setMethod(value)}><Text style={styles.choiceText}>{value.replace('_',' ')}</Text></Pressable>)}</View><AppButton title="Save expense" onPress={save} busy={busy} /></View></Screen>;
}
const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 27, fontWeight: '800', marginTop: 24 }, label: { color: colors.text, fontWeight: '700', marginTop: 18, marginBottom: 8 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9 }, selected: { borderColor: colors.tealDark, backgroundColor: '#DDF3EC' }, choiceText: { color: colors.navy, textTransform: 'capitalize' } });

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { userRoles, type UserRole } from '@/types/auth';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';

const labels: Record<UserRole, string> = { admin: 'Admin', branch_manager: 'Branch Manager', sales_manager: 'Sales Manager', sales_agent: 'Sales Agent', cashier: 'Cashier', inventory_manager: 'Inventory Manager', accountant: 'Accountant', viewer: 'Viewer' };

/** Simple role selector; selected role is a signup request and needs admin approval. */
export function RolePicker({ value, onChange, includeAdmin = true, label = 'Role requested' }: { value: UserRole; onChange: (role: UserRole) => void; includeAdmin?: boolean; label?: string }) {
  const options = includeAdmin ? userRoles : userRoles.filter((role) => role !== 'admin');
  return <View style={styles.wrap}><Text style={styles.title}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{options.map((role) => <Pressable key={role} onPress={() => onChange(role)} style={[styles.chip, value === role && styles.selected]}><Text style={[styles.text, value === role && styles.selectedText]}>{labels[role]}</Text></Pressable>)}</ScrollView></View>;
}

const styles = StyleSheet.create({ wrap: { marginTop: 18 }, title: { fontWeight: '700', color: colors.text, marginBottom: 9 }, row: { gap: 8 }, chip: { paddingHorizontal: 13, paddingVertical: 10, backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill }, selected: { borderColor: colors.teal, backgroundColor: '#E5F6F1' }, text: { color: colors.muted, fontSize: 13 }, selectedText: { color: colors.tealDark, fontWeight: '700' } });

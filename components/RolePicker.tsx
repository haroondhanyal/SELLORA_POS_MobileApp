import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { userRoles, type UserRole } from '@/types/auth';
import { useTheme } from '@/theme/ThemeProvider';

const labels: Record<UserRole, string> = { admin: 'Admin', branch_manager: 'Branch Manager', sales_manager: 'Sales Manager', sales_agent: 'Sales Agent', cashier: 'Cashier', inventory_manager: 'Inventory Manager', accountant: 'Accountant', viewer: 'Viewer' };
const icons: Record<UserRole, string> = { admin: '🛡️', branch_manager: '🏬', sales_manager: '📊', sales_agent: '🤝', cashier: '🧾', inventory_manager: '📦', accountant: '💰', viewer: '👁️' };

/** Selects a role request from a readable list; signup requests need admin approval. */
export function RolePicker({ value, onChange, includeAdmin = true, label = 'Role requested' }: { value: UserRole; onChange: (role: UserRole) => void; includeAdmin?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const highContrast = theme.name === 'high_contrast';
  const fieldBackground = highContrast ? '#000000' : theme.colors.surface;
  const fieldText = highContrast ? '#FFFFFF' : theme.colors.text;
  const options = includeAdmin ? userRoles : userRoles.filter((role) => role !== 'admin');
  return <View style={styles.wrap}>
    <Text style={[styles.title, { color: theme.colors.text }]}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${labels[value]}`} onPress={() => setOpen(true)} style={[styles.field, { backgroundColor: fieldBackground, borderColor: highContrast ? '#FFFFFF' : theme.colors.border, borderWidth: highContrast ? 2 : 1 }]}>
      <Text numberOfLines={1} style={[styles.value, { color: fieldText, fontWeight: highContrast ? '800' : '600' }]}>{icons[value]}  {labels[value]}</Text><Text style={{ color: fieldText, fontWeight: '800' }}>▾</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.heading, { color: theme.colors.text }]}>{label}</Text>
          <FlatList data={options} keyExtractor={(role) => role} renderItem={({ item }) => (
            <Pressable accessibilityState={{ selected: value === item }} style={[styles.row, { borderBottomColor: theme.colors.border }]} onPress={() => { onChange(item); setOpen(false); }}>
              <Text style={styles.icon}>{icons[item]}</Text><Text style={[styles.role, { color: theme.colors.text }]}>{labels[item]}</Text>
              {value === item ? <Text style={{ color: theme.colors.tealDark }}>✓</Text> : null}
            </Pressable>
          )} />
          <Pressable onPress={() => setOpen(false)} style={[styles.cancel, { backgroundColor: theme.colors.background }]}><Text style={{ color: theme.colors.text, fontWeight: '700' }}>Cancel</Text></Pressable>
        </View>
      </Pressable>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18 }, title: { fontWeight: '700', marginBottom: 9 },
  field: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { flex: 1, minWidth: 0, fontSize: 15 }, backdrop: { flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' },
  sheet: { maxHeight: '75%', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 }, heading: { fontSize: 19, fontWeight: '800', marginBottom: 10 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, gap: 12 }, icon: { fontSize: 20 }, role: { flex: 1, fontSize: 15 },
  cancel: { padding: 14, alignItems: 'center', borderRadius: 10, marginTop: 12 },
});

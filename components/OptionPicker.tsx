import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export type PickerOption = { id: string; label: string };

/** A small searchable-friendly modal choice field shared by product and stock forms. */
export function OptionPicker({ label, value, options, onChange, allowNone = false }: {
  label: string;
  value: string | null;
  options: PickerOption[];
  onChange: (id: string | null) => void;
  allowNone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const highContrast = theme.name === 'high_contrast';
  const fieldBackground = highContrast ? '#000000' : theme.colors.surface;
  const fieldText = highContrast ? '#FFFFFF' : theme.colors.text;
  const selected = options.find((option) => option.id === value);
  function select(id: string | null) {
    onChange(id);
    setOpen(false);
  }

  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.label ?? 'Choose'}`} onPress={() => setOpen(true)} style={[styles.field, { backgroundColor: fieldBackground, borderColor: highContrast ? '#FFFFFF' : theme.colors.border, borderWidth: highContrast ? 2 : 1 }]}>
        <Text style={[styles.value, { color: selected || highContrast ? fieldText : theme.colors.muted }]}>{selected?.label ?? 'Choose…'}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item.id}
              ListHeaderComponent={allowNone ? <Pressable style={[styles.row, { borderBottomColor: theme.colors.border }]} onPress={() => select(null)}><Text style={[styles.option, { color: theme.colors.text }]}>No {label.toLowerCase()}</Text></Pressable> : null}
              ListEmptyComponent={<Text style={[styles.empty, { color: theme.colors.muted }]}>No options available yet.</Text>}
              renderItem={({ item }) => <Pressable style={[styles.row, { borderBottomColor: theme.colors.border }]} onPress={() => select(item.id)}><Text style={[styles.option, { color: theme.colors.text }]}>{item.label}</Text></Pressable>}
            />
            <Pressable onPress={() => setOpen(false)} style={[styles.close, { backgroundColor: theme.colors.background }]}><Text style={[styles.closeText, { color: theme.colors.text }]}>Cancel</Text></Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: 16 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 7 },
  field: { minHeight: 52, borderWidth: 1, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 14 },
  value: { fontSize: 15 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '75%', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  title: { fontSize: 19, fontWeight: '800', marginBottom: 10 },
  row: { minHeight: 48, justifyContent: 'center', borderBottomWidth: 1 },
  option: { fontSize: 15 },
  empty: { paddingVertical: 18 },
  close: { padding: 13, alignItems: 'center', marginTop: 10, borderRadius: 10 },
  closeText: { fontWeight: '700' },
});

import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

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
  const selected = options.find((option) => option.id === value);
  function select(id: string | null) {
    onChange(id);
    setOpen(false);
  }

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.field}>
        <Text style={selected ? styles.value : styles.placeholder}>{selected?.label ?? 'Choose…'}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item.id}
              ListHeaderComponent={allowNone ? <Pressable style={styles.row} onPress={() => select(null)}><Text style={styles.option}>No {label.toLowerCase()}</Text></Pressable> : null}
              ListEmptyComponent={<Text style={styles.empty}>No options available yet.</Text>}
              renderItem={({ item }) => <Pressable style={styles.row} onPress={() => select(item.id)}><Text style={styles.option}>{item.label}</Text></Pressable>}
            />
            <Pressable onPress={() => setOpen(false)} style={styles.close}><Text style={styles.closeText}>Cancel</Text></Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: 16 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 7 },
  field: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: 'white', justifyContent: 'center', paddingHorizontal: 14 },
  value: { color: colors.text, fontSize: 15 },
  placeholder: { color: colors.muted, fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' },
  sheet: { maxHeight: '75%', backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  title: { color: colors.navy, fontSize: 19, fontWeight: '800', marginBottom: 10 },
  row: { minHeight: 48, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  option: { color: colors.text, fontSize: 15 },
  empty: { color: colors.muted, paddingVertical: 18 },
  close: { padding: 13, alignItems: 'center', marginTop: 10, backgroundColor: colors.background, borderRadius: 10 },
  closeText: { color: colors.navy, fontWeight: '700' },
});

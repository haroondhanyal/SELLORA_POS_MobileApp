import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';

/** Native date field used by signup and profile editing. */
export function DatePickerField({ label, value, onChange }: { label: string; value: Date | null; onChange: (date: Date) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? new Date(2000, 0, 1));
  function handleChange(event: DateTimePickerEvent, date?: Date) {
    if (event.type === 'dismissed') { setOpen(false); return; }
    if (date) { setDraft(date); if (Platform.OS === 'android') { onChange(date); setOpen(false); } }
  }
  return <View style={styles.group}><Text style={styles.label}>{label}</Text><Pressable onPress={() => setOpen(true)} style={styles.field}><Text style={[styles.value, !value && styles.placeholder]}>{value ? value.toLocaleDateString() : 'Select date'}</Text></Pressable>
    {open && Platform.OS === 'android' ? <DateTimePicker value={draft} mode="date" display="default" maximumDate={new Date()} onChange={handleChange} /> : null}
    <Modal transparent visible={open && Platform.OS === 'ios'} animationType="slide" onRequestClose={() => setOpen(false)}><View style={styles.backdrop}><View style={styles.sheet}><Text style={styles.sheetTitle}>Choose date</Text><DateTimePicker value={draft} mode="date" display="spinner" maximumDate={new Date()} onChange={handleChange} /><View style={styles.actions}><Pressable onPress={() => setOpen(false)}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable onPress={() => { onChange(draft); setOpen(false); }}><Text style={styles.done}>Done</Text></Pressable></View></View></View></Modal>
  </View>;
}

const styles = StyleSheet.create({ group: { marginTop: 16 }, label: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 7 }, field: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface, justifyContent: 'center', paddingHorizontal: 14 }, value: { color: colors.text, fontSize: 15 }, placeholder: { color: colors.muted }, backdrop: { flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' }, sheet: { backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 }, sheetTitle: { textAlign: 'center', color: colors.navy, fontSize: 18, fontWeight: '800' }, actions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }, cancel: { color: colors.muted, fontWeight: '700' }, done: { color: colors.tealDark, fontWeight: '800' } });

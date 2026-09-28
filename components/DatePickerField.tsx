import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { useTheme } from '@/theme/ThemeProvider';

/** Native date field used by signup and profile editing. */
export function DatePickerField({ label, value, onChange }: { label: string; value: Date | null; onChange: (date: Date) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? new Date(2000, 0, 1));
  const theme = useTheme();
  const highContrast = theme.name === 'high_contrast';
  function handleValueChange(_event: DateTimePickerChangeEvent, date: Date) {
    setDraft(date);
    if (Platform.OS === 'android') { onChange(date); setOpen(false); }
  }
  function openPicker() {
    // The profile date may arrive asynchronously after this component mounts.
    // Start each picker session from the latest saved value instead of stale state.
    setDraft(value ?? new Date(2000, 0, 1));
    setOpen(true);
  }
  const fieldBackground = highContrast ? '#000000' : theme.colors.surface;
  const fieldText = highContrast ? '#FFFFFF' : theme.colors.text;
  return <View style={styles.group}><Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ? value.toLocaleDateString() : 'Select date'}`} onPress={openPicker} style={[styles.field, { backgroundColor: fieldBackground, borderColor: highContrast ? '#FFFFFF' : theme.colors.border, borderWidth: highContrast ? 2 : 1 }]}><Text style={[styles.value, { color: value || highContrast ? fieldText : theme.colors.muted }]}>{value ? `📅  ${value.toLocaleDateString()}` : '📅  Select date'}</Text></Pressable>
    {open && Platform.OS === 'android' ? <DateTimePicker value={draft} mode="date" display="calendar" maximumDate={new Date()} onValueChange={handleValueChange} onDismiss={() => setOpen(false)} /> : null}
    <Modal transparent visible={open && Platform.OS === 'ios'} animationType="slide" onRequestClose={() => setOpen(false)}><View style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}><View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}><Text style={[styles.sheetTitle, { color: theme.colors.text }]}>Choose date</Text><DateTimePicker value={draft} mode="date" display="inline" maximumDate={new Date()} onValueChange={handleValueChange} onDismiss={() => setOpen(false)} /><View style={styles.actions}><Pressable onPress={() => setOpen(false)}><Text style={[styles.cancel, { color: theme.colors.text }]}>Cancel</Text></Pressable><Pressable onPress={() => { onChange(draft); setOpen(false); }}><Text style={[styles.done, { color: theme.colors.tealDark }]}>Done</Text></Pressable></View></View></View></Modal>
  </View>;
}

const styles = StyleSheet.create({ group: { marginTop: 16 }, label: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 7 }, field: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface, justifyContent: 'center', paddingHorizontal: 14 }, value: { color: colors.text, fontSize: 15 }, placeholder: { color: colors.muted }, backdrop: { flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' }, sheet: { backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 }, sheetTitle: { textAlign: 'center', color: colors.navy, fontSize: 18, fontWeight: '800' }, actions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }, cancel: { color: colors.muted, fontWeight: '700' }, done: { color: colors.tealDark, fontWeight: '800' } });

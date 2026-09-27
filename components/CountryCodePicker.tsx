import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export const phoneCountryCodes = [
  { name: 'Pakistan', code: '+92', flag: '🇵🇰' }, { name: 'United States', code: '+1', flag: '🇺🇸' },
  { name: 'United Kingdom', code: '+44', flag: '🇬🇧' }, { name: 'United Arab Emirates', code: '+971', flag: '🇦🇪' },
  { name: 'India', code: '+91', flag: '🇮🇳' }, { name: 'Saudi Arabia', code: '+966', flag: '🇸🇦' },
  { name: 'Canada', code: '+1', flag: '🇨🇦' }, { name: 'Australia', code: '+61', flag: '🇦🇺' },
  { name: 'Turkey', code: '+90', flag: '🇹🇷' }, { name: 'Bangladesh', code: '+880', flag: '🇧🇩' },
  { name: 'Qatar', code: '+974', flag: '🇶🇦' }, { name: 'Oman', code: '+968', flag: '🇴🇲' },
];

/** Country calling-code dropdown used by signup and profile forms. */
export function CountryCodePicker({ value, onChange, compact = false, countryName }: { value: string; onChange: (code: string, countryName?: string) => void; compact?: boolean; countryName?: string }) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const highContrast = theme.name === 'high_contrast';
  const fieldBackground = highContrast ? '#000000' : theme.colors.surface;
  const fieldText = highContrast ? '#FFFFFF' : theme.colors.text;
  const selected = phoneCountryCodes.find((country) => country.name === countryName && country.code === value)
    ?? phoneCountryCodes.find((country) => country.code === value) ?? phoneCountryCodes[0];
  return <View style={[styles.group, compact && styles.compactGroup]}>
    {!compact ? <Text style={[styles.label, { color: theme.colors.text }]}>Country code</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={`Country ${selected.name}, calling code ${selected.code}`} onPress={() => setOpen(true)} style={[styles.field, compact && styles.compactField, { backgroundColor: fieldBackground, borderColor: highContrast ? '#FFFFFF' : theme.colors.border, borderWidth: highContrast ? 2 : 1 }]}>
      {compact ? <View style={styles.compactValue}><Text style={[styles.compactCode, { color: fieldText }]}>{selected.flag} {selected.code}</Text><Text numberOfLines={1} style={[styles.countryName, { color: fieldText }]}>{selected.name}</Text></View> : <Text numberOfLines={1} style={[styles.value, { color: fieldText, fontWeight: highContrast ? '800' : '400' }]}>{selected.flag}  {selected.name} ({selected.code})</Text>}<Text style={{ color: fieldText, fontWeight: '800' }}>▾</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Choose country code</Text>
          <FlatList data={phoneCountryCodes} keyExtractor={(item, index) => `${item.name}-${index}`} renderItem={({ item }) => (
            <Pressable accessibilityState={{ selected: selected.name === item.name }} style={[styles.row, { borderBottomColor: theme.colors.border }]} onPress={() => { onChange(item.code, item.name); setOpen(false); }}>
              <Text style={styles.flag}>{item.flag}</Text><Text style={[styles.name, { color: theme.colors.text }]}>{item.name}</Text><Text style={[styles.code, { color: theme.colors.muted }]}>{item.code}</Text>
            </Pressable>
          )} />
          <Pressable onPress={() => setOpen(false)} style={[styles.cancel, { backgroundColor: theme.colors.background }]}><Text style={{ color: theme.colors.text, fontWeight: '700' }}>Cancel</Text></Pressable>
        </View>
      </Pressable>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  group: { marginTop: 16 }, compactGroup: { width: 126 }, label: { fontWeight: '700', marginBottom: 8 },
  field: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, compactField: { paddingHorizontal: 8, minHeight: 58 },
  value: { flex: 1, fontSize: 15 }, compactValue: { flex: 1, minWidth: 0, gap: 2 }, compactCode: { fontSize: 14, fontWeight: '800' }, countryName: { fontSize: 11, fontWeight: '600' }, backdrop: { flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' },
  sheet: { maxHeight: '75%', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  title: { fontSize: 19, fontWeight: '800', marginBottom: 10 }, row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, gap: 12 },
  flag: { fontSize: 22 }, name: { flex: 1, fontSize: 15 }, code: { fontSize: 15 }, cancel: { padding: 14, alignItems: 'center', borderRadius: 10, marginTop: 12 },
});

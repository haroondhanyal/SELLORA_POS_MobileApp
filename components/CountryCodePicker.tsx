import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';

const countryCodes = [{ name: 'Pakistan', code: '+92' }, { name: 'United States', code: '+1' }, { name: 'United Kingdom', code: '+44' }, { name: 'UAE', code: '+971' }, { name: 'India', code: '+91' }];

/** Small horizontally scrolling country-code selector for signup and profile. */
export function CountryCodePicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  return <View style={styles.group}><Text style={styles.label}>Country code</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{countryCodes.map((country) => <Pressable key={country.code} onPress={() => onChange(country.code)} style={[styles.chip, value === country.code && styles.selected]}><Text style={[styles.text, value === country.code && styles.selectedText]}>{country.name} {country.code}</Text></Pressable>)}</ScrollView></View>;
}

const styles = StyleSheet.create({ group: { marginTop: 16 }, label: { color: colors.text, fontWeight: '700', marginBottom: 8 }, row: { gap: 8 }, chip: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill }, selected: { backgroundColor: '#E5F6F1', borderColor: colors.teal }, text: { color: colors.muted, fontSize: 13 }, selectedText: { color: colors.tealDark, fontWeight: '700' } });

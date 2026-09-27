import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FormField } from '@/components/FormField';
import { EyeIcon } from '@/components/PasswordField';
import { useTheme } from '@/theme/ThemeProvider';

/** Secure numeric PIN input that filters out non-digit characters. */
export function PinField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  const theme = useTheme();
  return <View style={styles.row}><View style={styles.input}><FormField label={label} value={value} onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry={!visible} maxLength={6} autoComplete="off" /></View><Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide PIN' : 'Show PIN'} onPress={() => setVisible(!visible)} style={styles.toggle}><EyeIcon visible={visible} color={theme.colors.muted} /></Pressable></View>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'flex-end' }, input: { flex: 1 }, toggle: { marginLeft: 8, padding: 12, marginBottom: 3 } });

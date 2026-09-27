import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FormField } from '@/components/FormField';
import { Svg, Path, Circle } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

/** Reusable password field with visibility toggle and a simple strength hint. */
export function PasswordField({ value, onChangeText, label = 'Password', autoComplete = 'new-password', showStrength = true }: { value: string; onChangeText: (value: string) => void; label?: string; autoComplete?: 'current-password' | 'new-password' | 'off'; showStrength?: boolean }) {
  const [visible, setVisible] = useState(false);
  const theme = useTheme();
  const strength = value.length === 0 ? '' : value.length < 8 ? 'Use at least 8 characters' : value.match(/[A-Z]/) && value.match(/[0-9]/) ? 'Good password' : 'Add a number and uppercase letter for a stronger password';
  return <View>
    <View style={styles.row}><View style={styles.input}><FormField label={label} value={value} onChangeText={onChangeText} secureTextEntry={!visible} autoCapitalize="none" autoComplete={autoComplete} /></View><Pressable accessibilityRole="button" accessibilityState={{ selected: visible }} accessibilityLabel={visible ? 'Hide password' : 'Show password'} accessibilityHint="Toggles password visibility" hitSlop={8} onPress={() => setVisible(!visible)} style={[styles.toggle, { backgroundColor: theme.colors.surfaceTint, borderColor: theme.colors.border }]}><EyeIcon visible={visible} color={theme.colors.tealDark} /></Pressable></View>
    {showStrength && strength ? <Text style={[styles.hint, { color: value.length >= 8 ? theme.colors.success : theme.colors.muted }]}>{strength}</Text> : null}
  </View>;
}

export function EyeIcon({ visible, color }: { visible: boolean; color: string }) {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" stroke={color} strokeWidth={1.8} /><Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.8} />{visible ? <Path d="m4 4 16 16" stroke={color} strokeWidth={1.8} /> : null}</Svg>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'flex-end' }, input: { flex: 1 }, toggle: { width: 48, height: 48, marginLeft: 8, marginBottom: 2, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, hint: { fontSize: 12, marginTop: 5 } });

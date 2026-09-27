import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FormField } from '@/components/FormField';
import { colors } from '@/theme/colors';

/** Reusable password field with visibility toggle and a simple strength hint. */
export function PasswordField({ value, onChangeText, label = 'Password', autoComplete = 'new-password', showStrength = true }: { value: string; onChangeText: (value: string) => void; label?: string; autoComplete?: 'current-password' | 'new-password' | 'off'; showStrength?: boolean }) {
  const [visible, setVisible] = useState(false);
  const strength = value.length === 0 ? '' : value.length < 8 ? 'Use at least 8 characters' : value.match(/[A-Z]/) && value.match(/[0-9]/) ? 'Good password' : 'Add a number and uppercase letter for a stronger password';
  return <View>
    <View style={styles.row}><View style={styles.input}><FormField label={label} value={value} onChangeText={onChangeText} secureTextEntry={!visible} autoCapitalize="none" autoComplete={autoComplete} /></View><Pressable accessibilityRole="button" onPress={() => setVisible(!visible)} style={styles.toggle}><Text style={styles.toggleText}>{visible ? 'Hide' : 'Show'}</Text></Pressable></View>
    {showStrength && strength ? <Text style={[styles.hint, value.length >= 8 && styles.good]}>{strength}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'flex-end' }, input: { flex: 1 }, toggle: { marginLeft: 8, padding: 12, marginBottom: 3 }, toggleText: { color: colors.tealDark, fontWeight: '700' }, hint: { color: colors.muted, fontSize: 12, marginTop: 5 }, good: { color: colors.success } });

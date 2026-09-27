import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { useTheme } from '@/theme/ThemeProvider';

/** Labelled text field with a visible validation message. */
export function FormField({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const theme = useTheme();
  return <View style={styles.group}><Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text><TextInput placeholderTextColor={theme.colors.muted} style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.text }, error && styles.invalid]} {...props} />{error ? <Text style={styles.error}>{error}</Text> : null}</View>;
}

const styles = StyleSheet.create({ group: { marginTop: 16 }, label: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 7 }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface, paddingHorizontal: 14, fontSize: 15, color: colors.text }, invalid: { borderColor: colors.danger }, error: { color: colors.danger, fontSize: 12, marginTop: 5 } });

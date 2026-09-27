import { useEffect, useId, useRef } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { useTheme } from '@/theme/ThemeProvider';
import { useFormKeyboard } from '@/providers/KeyboardFormProvider';

/** Labelled text field with a visible validation message. */
export function FormField({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const theme = useTheme();
  const highContrast = theme.name === 'high_contrast';
  // High-contrast inputs use a dark surface so white entered text stays readable in both modes.
  const fieldBackground = highContrast ? '#000000' : theme.colors.surface;
  const fieldText = highContrast ? '#FFFFFF' : theme.colors.text;
  const navigation = useFormKeyboard();
  const id = useId();
  const input = useRef<TextInput>(null);
  navigation?.reserve(id);
  useEffect(() => navigation?.register(id, input), [id, navigation]);
  const customSubmit = props.onSubmitEditing;
  const multiline = Boolean(props.multiline);
  return <View style={styles.group}><Text style={[styles.label, { color: theme.colors.text, fontWeight: highContrast ? '800' : '700' }]}>{label}</Text><TextInput ref={input} placeholderTextColor={highContrast ? '#E5E5E5' : theme.colors.muted} selectionColor={theme.colors.teal} style={[styles.input, { backgroundColor: fieldBackground, borderColor: highContrast ? '#FFFFFF' : theme.colors.border, color: fieldText, borderWidth: highContrast ? 2 : 1, fontSize: highContrast ? 16 : 15 }, error && styles.invalid]} returnKeyType={props.returnKeyType ?? (multiline ? 'default' : 'next')} blurOnSubmit={props.blurOnSubmit ?? multiline} onSubmitEditing={customSubmit ?? (() => { if (multiline) Keyboard.dismiss(); else navigation?.focusNext(id); })} {...props} />{error ? <Text style={styles.error}>{error}</Text> : null}</View>;
}

const styles = StyleSheet.create({ group: { marginTop: 16 }, label: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 7 }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface, paddingHorizontal: 14, fontSize: 15, color: colors.text }, invalid: { borderColor: colors.danger }, error: { color: colors.danger, fontSize: 12, marginTop: 5 } });

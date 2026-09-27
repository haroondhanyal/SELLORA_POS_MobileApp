import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { useTheme } from '@/theme/ThemeProvider';

/** Consistent accessible button with a clear disabled/loading state. */
export function AppButton({ title, onPress, busy = false, secondary = false, disabled = false }: { title: string; onPress: () => void; busy?: boolean; secondary?: boolean; disabled?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: secondary ? 'transparent' : theme.colors.teal, borderColor: theme.colors.border }, secondary && styles.secondary, pressed && styles.pressed, (busy || disabled) && styles.disabled]}>
    {busy ? <ActivityIndicator color={secondary ? theme.colors.navy : 'white'} /> : <Text style={[styles.label, { color: secondary ? theme.colors.navy : 'white' }, secondary && styles.secondaryLabel]}>{title}</Text>}
  </Pressable>;
}

const styles = StyleSheet.create({ button: { minHeight: 54, borderRadius: radius.md, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 12 }, secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }, label: { color: 'white', fontSize: 16, fontWeight: '700' }, secondaryLabel: { color: colors.navy }, pressed: { opacity: 0.82 }, disabled: { opacity: 0.55 } });

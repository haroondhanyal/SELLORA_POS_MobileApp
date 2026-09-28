import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { KeyboardFormProvider } from '@/providers/KeyboardFormProvider';
import { ThemeStyle } from '@/components/ThemeStyle';

/** Shared safe-area and scrolling layout for independent screens. */
export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const theme = useTheme();
  return <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'right', 'bottom', 'left']}>
    <KeyboardFormProvider><KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
    {scroll ? <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={styles.content}><ThemeStyle>{children}</ThemeStyle></ScrollView> : <View style={styles.content}><ThemeStyle>{children}</ThemeStyle></View>}
    </KeyboardAvoidingView></KeyboardFormProvider>
  </SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, keyboard: { flex: 1 }, content: { flexGrow: 1, padding: 24 } });

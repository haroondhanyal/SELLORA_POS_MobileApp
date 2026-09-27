import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { themeNames, type ThemeMode, type ThemeName } from '@/theme/themes';

/** Quick light/dark switch for auth pages and the shared app header. */
export function AppearanceToggle() {
  const { name, mode, setPreferences, colors } = useTheme();
  const [open, setOpen] = useState(false);
  async function choose(next: { name: ThemeName; mode: ThemeMode }) {
    try { await setPreferences(next); setOpen(false); }
    catch { Alert.alert('Could not save appearance', 'Please try again.'); }
  }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Open appearance themes" onPress={() => setOpen(true)} style={[styles.button, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.icon, { color: colors.text }]}>◐</Text><Text style={[styles.label, { color: colors.text }]}>Theme</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setOpen(false)}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>Appearance</Text>
          <Text style={[styles.section, { color: colors.muted }]}>Color theme</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
            {themeNames.map((themeName) => <Choice key={themeName} label={formatName(themeName)} selected={name === themeName} onPress={() => void choose({ name: themeName, mode })} colors={colors} />)}
          </ScrollView>
          <Text style={[styles.section, { color: colors.muted }]}>Brightness</Text>
          <View style={styles.options}>{(['system', 'light', 'dark'] as const).map((themeMode) => <Choice key={themeMode} label={formatName(themeMode)} selected={mode === themeMode} onPress={() => void choose({ name, mode: themeMode })} colors={colors} />)}</View>
          <Pressable onPress={() => setOpen(false)} style={[styles.cancel, { backgroundColor: colors.background }]}><Text style={[styles.cancelText, { color: colors.text }]}>Done</Text></Pressable>
        </View>
      </Pressable>
    </Modal>
  </>;
}

function Choice({ label, selected, onPress, colors }: { label: string; selected: boolean; onPress: () => void; colors: ReturnType<typeof useTheme>['colors'] }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, { borderColor: selected ? colors.tealDark : colors.border, backgroundColor: selected ? colors.surfaceTint : colors.surface }]}><Text style={[styles.choiceText, { color: colors.text }]}>{selected ? '✓ ' : ''}{label}</Text></Pressable>;
}
function formatName(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

const styles = StyleSheet.create({ button: { borderWidth: 1, borderRadius: 18, minHeight: 36, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 }, icon: { fontSize: 16 }, label: { fontWeight: '700', fontSize: 12 }, backdrop: { flex: 1, justifyContent: 'flex-end' }, sheet: { maxHeight: '80%', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 }, title: { fontSize: 20, fontWeight: '800', marginBottom: 18 }, section: { fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 6 }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 }, choice: { minHeight: 40, paddingHorizontal: 13, justifyContent: 'center', borderWidth: 1, borderRadius: 20 }, choiceText: { fontSize: 13, fontWeight: '700' }, cancel: { padding: 13, alignItems: 'center', borderRadius: 10, marginTop: 6 }, cancelText: { fontWeight: '800' } });

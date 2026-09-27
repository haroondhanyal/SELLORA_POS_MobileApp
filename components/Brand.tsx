import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

/** Reusable SVG brand mark that matches the native icon and splash assets. */
export function Brand({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  const markSize = compact ? 36 : 52;
  return <View style={styles.row}>
    <View style={[styles.mark, { backgroundColor: theme.colors.teal, width: markSize, height: markSize }, compact && styles.smallMark]}>
      <Svg width={markSize} height={markSize} viewBox="0 0 52 52" accessibilityLabel="Sellora shopping bag logo">
        <Rect x="13" y="19" width="27" height="23" rx="4" fill="#fff" />
        <Path d="M19 20v-4a7.5 7.5 0 0 1 15 0v4" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <Path d="M31 24c-6-3-10 3-5 5l5 2c5 2 2 8-3 8-3 0-5-1-7-3" fill="none" stroke={theme.colors.tealDark} strokeWidth="2.5" strokeLinecap="round" />
      </Svg>
    </View>
    <View><Text style={[styles.name, { color: theme.colors.navy }, compact && styles.smallName]}>SELLORA</Text>{!compact && <Text style={[styles.tagline, { color: theme.colors.muted }]}>Sell Smarter. Manage Anywhere.</Text>}</View>
  </View>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, mark: { width: 52, height: 52, borderRadius: 17, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' }, letter: { color: 'white', fontSize: 29, fontWeight: '800' }, name: { color: colors.navy, fontWeight: '900', fontSize: 22, letterSpacing: 2 }, tagline: { color: colors.muted, fontSize: 12, marginTop: 3 }, smallMark: { width: 36, height: 36, borderRadius: 12 }, smallLetter: { fontSize: 21 }, smallName: { fontSize: 16 } });

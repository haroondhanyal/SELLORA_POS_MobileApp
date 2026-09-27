import { colors as baseColors } from '@/theme/colors';

/** Named theme palettes, kept in one place so screens do not invent colors. */
export const themeNames = ['sellora', 'ocean', 'emerald', 'purple', 'midnight', 'sunset', 'monochrome'] as const;
export type ThemeName = typeof themeNames[number];
export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemePalette = typeof baseColors;

const accents: Record<ThemeName, { primary: string; dark: string }> = {
  sellora: { primary: '#19A88A', dark: '#12806C' },
  ocean: { primary: '#2B83C6', dark: '#17629A' },
  emerald: { primary: '#198754', dark: '#10663E' },
  purple: { primary: '#8254C8', dark: '#60399C' },
  midnight: { primary: '#607AE8', dark: '#425CC2' },
  sunset: { primary: '#E77A46', dark: '#BD522B' },
  monochrome: { primary: '#4E5B61', dark: '#303B40' },
};

/** Builds one complete palette for the selected theme and appearance mode. */
export function getThemePalette(name: ThemeName, mode: Exclude<ThemeMode, 'system'>): ThemePalette {
  const accent = accents[name];
  if (mode === 'dark') return { ...baseColors, navy: '#EAF1F3', teal: accent.primary, tealDark: '#80D8C4', background: '#101B20', surface: '#18272E', text: '#EAF1F3', muted: '#A3B2B8', border: '#304149' };
  return { ...baseColors, teal: accent.primary, tealDark: accent.dark };
}

import { colors as mutableColors, defaultColors as baseColors } from '@/theme/colors';

/** Named theme palettes, kept in one place so screens do not invent colors. */
export const themeNames = ['sellora', 'ocean', 'emerald', 'purple', 'midnight', 'sunset', 'monochrome', 'grey', 'silver', 'high_contrast'] as const;
export type ThemeName = typeof themeNames[number];
export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemePalette = typeof mutableColors;

const accents: Record<ThemeName, { primary: string; dark: string }> = {
  sellora: { primary: '#19A88A', dark: '#12806C' },
  ocean: { primary: '#2B83C6', dark: '#17629A' },
  emerald: { primary: '#198754', dark: '#10663E' },
  purple: { primary: '#8254C8', dark: '#60399C' },
  midnight: { primary: '#607AE8', dark: '#425CC2' },
  sunset: { primary: '#E77A46', dark: '#BD522B' },
  monochrome: { primary: '#4E5B61', dark: '#303B40' },
  grey: { primary: '#70777D', dark: '#4E565C' },
  silver: { primary: '#687984', dark: '#4C5B65' },
  high_contrast: { primary: '#005FCC', dark: '#0047A3' },
};

/** Builds one complete palette for the selected theme and appearance mode. */
export function getThemePalette(name: ThemeName, mode: Exclude<ThemeMode, 'system'>): ThemePalette {
  const accent = accents[name];
  if (name === 'high_contrast') return mode === 'dark'
    ? { ...baseColors, navy: '#FFFFFF', teal: '#73B7FF', tealDark: '#9CCBFF', background: '#000000', surface: '#111111', surfaceTint: '#172B3E', successSurface: '#12351D', warningSurface: '#392B00', dangerSurface: '#3D1111', overlay: '#000B', text: '#FFFFFF', muted: '#E5E5E5', border: '#FFFFFF', danger: '#FF7777', success: '#72E694', warning: '#FFD95A', onAccent: '#000000' }
    : { ...baseColors, navy: '#000000', teal: '#005FCC', tealDark: '#0047A3', background: '#FFFFFF', surface: '#FFFFFF', surfaceTint: '#D9EAFE', successSurface: '#D8F5DF', warningSurface: '#FFF0B3', dangerSurface: '#FFE0E0', overlay: '#000A', text: '#000000', muted: '#333333', border: '#111111', danger: '#B00020', success: '#006B2E', warning: '#694500', onAccent: '#FFFFFF' };
  if (mode === 'dark') return { ...baseColors, navy: '#EAF1F3', teal: accent.primary, tealDark: name === 'grey' ? '#D6DADF' : name === 'silver' ? '#D2DADF' : '#80D8C4', background: name === 'silver' ? '#171C20' : '#101B20', surface: name === 'silver' ? '#252B30' : '#18272E', surfaceTint: '#26353B', successSurface: '#173A30', warningSurface: '#3A301B', dangerSurface: '#3E2528', overlay: '#000B', text: '#EAF1F3', muted: '#A3B2B8', border: '#46535A', onAccent: '#FFFFFF' };
  if (name === 'silver') return { ...baseColors, navy: '#263238', teal: accent.primary, tealDark: accent.dark, background: '#E7EBEE', surface: '#F7F8F9', surfaceTint: '#DCE4E8', successSurface: '#DDECE6', warningSurface: '#F5EBD5', dangerSurface: '#F3DEDF', text: '#28343A', muted: '#58656C', border: '#AEBBC2' };
  if (name === 'grey') return { ...baseColors, navy: '#263238', teal: accent.primary, tealDark: accent.dark, background: '#ECEFF1', surface: '#FFFFFF', surfaceTint: '#E0E5E8', successSurface: '#DDECE6', warningSurface: '#F5EBD5', dangerSurface: '#F3DEDF', text: '#263238', muted: '#54636B', border: '#B0BEC5' };
  return { ...baseColors, teal: accent.primary, tealDark: accent.dark };
}

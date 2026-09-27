import { Children, cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { colors, defaultColors } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

/** Recolors static legacy StyleSheet tokens inside a component's rendered tree. */
export function ThemeStyle({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return recolorChildren(children, theme.colors);
}

function recolorChildren(children: ReactNode, palette: typeof colors): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<{ style?: unknown; children?: ReactNode }>;
    const props = element.props;
    const childNodes = recolorChildren(props.children, palette);
    if (element.type === Fragment) return cloneElement(element, { children: childNodes });
    // Do not pass an empty style prop: custom fields may use their own internal styles.
    const themedProps: { style?: unknown; children?: ReactNode } = { children: childNodes };
    if (props.style !== undefined) {
      themedProps.style = Array.isArray(props.style)
        ? props.style.map((part) => recolorStyle(part, palette))
        : recolorStyle(props.style, palette);
    }
    return cloneElement(element, themedProps);
  });
}

function recolorStyle(style: unknown, palette: typeof colors): unknown {
  if (Array.isArray(style)) return style.map((part) => recolorStyle(part, palette));
  if (typeof style === 'function') return (...args: unknown[]) => recolorStyle(style(...args), palette);
  if (!style || typeof style !== 'object') return style;
  const tokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(defaultColors)) {
    if (typeof value === 'string' && key !== 'surface' && key !== 'onAccent') tokens[value.toUpperCase()] = palette[key as keyof typeof palette] as string;
  }
  Object.assign(tokens, {
    '#E5F6F1': palette.surfaceTint, '#E6F6F1': palette.surfaceTint, '#DDF3EC': palette.surfaceTint,
    '#F2FBF8': palette.surfaceTint, '#FFF5DF': palette.warningSurface, '#FCEEEE': palette.dangerSurface,
    '#E8A33A': palette.gold, '#0007': palette.overlay, '#101B20': palette.background,
  });
  const next: Record<string, unknown> = { ...style };
  for (const key of ['color', 'backgroundColor', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'tintColor', 'shadowColor']) {
    const value = next[key];
    if (typeof value !== 'string') continue;
    if (key === 'backgroundColor' && (value.toLowerCase() === 'white' || value.toUpperCase() === defaultColors.surface)) next[key] = palette.surface;
    else if (key === 'color' && (value.toLowerCase() === 'white' || value.toUpperCase() === defaultColors.onAccent)) next[key] = palette.onAccent;
    else next[key] = tokens[value.toUpperCase()] ?? value;
  }
  return next;
}

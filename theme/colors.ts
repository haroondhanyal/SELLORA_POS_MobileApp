/** Shared Sellora colors. Screens should use these tokens instead of ad hoc colors. */
export const colors = {
  navy: '#102C3A',
  teal: '#19A88A',
  tealDark: '#12806C',
  background: '#F4F7F8',
  surface: '#FFFFFF',
  surfaceTint: '#E5F6F1',
  successSurface: '#E5F6F1',
  warningSurface: '#FFF5DF',
  dangerSurface: '#FCEEEE',
  overlay: '#0007',
  gold: '#E8A33A',
  onAccent: '#FFFFFF',
  text: '#182A33',
  muted: '#71818A',
  border: '#DEE7E9',
  danger: '#C44747',
  success: '#16805E',
  warning: '#B27618',
};

/** Immutable original tokens map legacy screen colors onto the chosen theme. */
export const defaultColors = Object.freeze({ ...colors });

// app/theme.ts
// Shared colors and spacing so screens look consistent, in light and dark mode.
// Screens read the active palette with useTheme() / useThemedStyles() from context/ThemeContext.

export type Palette = {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  overlay: string;
  shadowColor: string;
};

export const lightColors: Palette = {
  background: '#f4f6fc',
  surface: '#ffffff',
  surfaceMuted: '#f3f4f8',
  surfaceRaised: '#ffffff',
  border: '#e5e7eb',
  text: '#111827',
  textMuted: '#6b7280',
  textSubtle: '#9ca3af',
  primary: '#4f46e5',
  primarySoft: '#eef2ff',
  onPrimary: '#ffffff',
  success: '#15803d',
  successSoft: '#dcfce7',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  warning: '#b45309',
  warningSoft: '#fef3c7',
  overlay: 'rgba(15, 23, 42, 0.45)',
  shadowColor: 'rgba(17, 24, 39, 0.08)',
};

export const darkColors: Palette = {
  background: '#0b1120',
  surface: '#111827',
  surfaceMuted: '#1f2937',
  surfaceRaised: '#1a2332',
  border: '#273244',
  text: '#f3f4f6',
  textMuted: '#9ca3af',
  textSubtle: '#6b7280',
  primary: '#818cf8',
  primarySoft: '#1e1b4b',
  onPrimary: '#0b1120',
  success: '#4ade80',
  successSoft: '#14361f',
  danger: '#f87171',
  dangerSoft: '#3b1515',
  warning: '#fbbf24',
  warningSoft: '#3a2a0a',
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadowColor: 'rgba(0, 0, 0, 0.4)',
};

// Light palette, for code that hasn't moved to useTheme() yet.
export const colors = lightColors;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const shadowFor = (c: Palette) => ({
  boxShadow: `0px 2px 8px ${c.shadowColor}`,
  elevation: 3,
});
export const shadow = shadowFor(lightColors);

// Text color that stays readable on a colored badge: dark text on light colors (yellow TE,
// teal RB), white text on dark ones.
export function readableOn(hex: string): string {
  const m = String(hex).replace('#', '');
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
  if ([r, g, b].some(v => Number.isNaN(v))) return '#ffffff';
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.4 ? '#111827' : '#ffffff';
}

export const positionColors: Record<string, string> = {
  QB: '#ff6b6b',
  RB: '#2ec4b6',
  WR: '#48b0f7',
  TE: '#ffbe0b',
  K: '#9d4edd',
  DEF: '#777777',
  FLEX: '#8b8f99',
};

export const getPositionColor = (pos: string) => positionColors[String(pos).toUpperCase()] ?? '#aaaaaa';

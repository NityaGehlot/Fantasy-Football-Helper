// app/theme.ts
// Shared colors and spacing so screens look consistent.

export const colors = {
  background: '#f4f6fc',
  surface: '#ffffff',
  surfaceMuted: '#f3f4f8',
  border: '#e5e7eb',
  text: '#111827',
  textMuted: '#6b7280',
  primary: '#4f46e5',
  primarySoft: '#eef2ff',
  success: '#16a34a',
  successSoft: '#dcfce7',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  warning: '#d97706',
  warningSoft: '#fef3c7',
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const shadow = {
  boxShadow: '0px 2px 8px rgba(17, 24, 39, 0.08)',
  elevation: 3,
};

export const positionColors: Record<string, string> = {
  QB: '#ff6b6b',
  RB: '#2ec4b6',
  WR: '#48b0f7',
  TE: '#ffbe0b',
  K: '#9d4edd',
  DEF: '#777777',
};

export const getPositionColor = (pos: string) => positionColors[String(pos).toUpperCase()] ?? '#aaaaaa';

/**
 * ConsorFix design tokens — adaptado a RN (oklch → hex aproximado).
 * Fuente: /Users/felipeganame/Downloads/claude design/tokens.css
 */
export const COLORS = {
  /* Brand */
  blue900: '#0e2347',
  blue800: '#162f5e',
  blue700: '#2152a8',
  blue600: '#3a73c4',
  blue500: '#6896d8',
  blue100: '#e7eef9',
  blue50:  '#eef3fb',

  /* Neutrals (cool) */
  ink:   '#0f172a',
  ink2:  '#334155',
  ink3:  '#64748b',
  ink4:  '#94a3b8',
  line:  '#e2e8f0',
  line2: '#eef1f5',
  bg:    '#f7f9fc',
  surface: '#ffffff',

  /* Urgency */
  critical:   '#dc2626',
  criticalBg: '#fef2f2',
  medium:     '#d97706',
  mediumBg:   '#fef3c7',
  conduct:    '#0284c7',
  conductBg:  '#e0f2fe',
  resolved:   '#16a34a',
  resolvedBg: '#dcfce7',

  /* Origin */
  whatsapp:   '#25D366',
  whatsappDk: '#1faa50',

  /* Legacy aliases — TODO: remove tras migrar todos los screens. */
  primary: '#2152a8',
  primaryDark: '#162f5e',
  danger: '#dc2626',
  muted: '#64748b',
  text: '#0f172a',
  border: '#e2e8f0',
  panel: '#ffffff',
  badge: '#eef1f5',
};

export const RADIUS = {
  sm: 6,
  base: 10,
  lg: 14,
  xl: 20,
};

export const URGENCIA_COLOR: Record<string, string> = {
  CRITICA: COLORS.critical,
  ALTA: COLORS.critical,
  MEDIA: COLORS.medium,
  BAJA: COLORS.resolved,
};

export const URGENCIA_BG: Record<string, string> = {
  CRITICA: COLORS.criticalBg,
  ALTA: COLORS.criticalBg,
  MEDIA: COLORS.mediumBg,
  BAJA: COLORS.resolvedBg,
};

export const URGENCIA_LABEL: Record<string, string> = {
  CRITICA: 'Crítico',
  ALTA: 'Alto',
  MEDIA: 'Medio',
  BAJA: 'Bajo',
};

export const ESTADO_COLOR: Record<string, string> = {
  REGISTRADO: COLORS.blue700,
  VALIDADO: COLORS.medium,
  SOLUCIONADO: COLORS.resolved,
  DESCARTADO: COLORS.ink3,
};

export const ESTADO_BG: Record<string, string> = {
  REGISTRADO: COLORS.blue50,
  VALIDADO: COLORS.mediumBg,
  SOLUCIONADO: COLORS.resolvedBg,
  DESCARTADO: COLORS.line2,
};

export const ESTADO_LABEL: Record<string, string> = {
  REGISTRADO: 'Recibido',
  VALIDADO: 'En curso',
  DESCARTADO: 'Descartado',
  SOLUCIONADO: 'Resuelto',
};

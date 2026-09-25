import type { TextStyle, ViewStyle } from 'react-native';

// Tokens visuales de RutaSegura. Los mismos valores viven en la web del
// apoderado (apps/web-apoderado/public/styles.css) para que las dos apps se
// lean como un mismo producto.
export const colors = {
  bg: '#F5F8FD',
  card: '#FFFFFF',
  cardBorder: '#DDE6F2',
  text: '#0B2A55',
  textMuted: '#5B6B84',
  accent: '#0B3A70',
  accentSoft: '#EAF2FF',
  blue: '#2684FF',
  yellow: '#FFD23F',
  success: '#19B96B',
  successBg: '#E8F8EF',
  danger: '#EF4444',
  dangerBg: '#FEECEC',
  chipBg: '#EAF2FF',
  white: '#FFFFFF',
} as const;

// Escala de espaciado y radios — se usan con `gap` en flex en vez de
// márgenes sueltos, para que el ritmo vertical sea consistente.
export const space = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 16, xl: 22, pill: 999 } as const;

// Sombra suave para tarjetas y botones elevados (iOS + Android).
export const shadowCard: ViewStyle = {
  shadowColor: '#0B2A55',
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
};

// Escala tipográfica única. Cada pantalla toma de acá en vez de inventar
// tamaños sueltos.
export const typography = {
  display: { fontSize: 34, fontWeight: '800', color: colors.text, letterSpacing: -0.5 } as TextStyle,
  h2: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.3 } as TextStyle,
  title: { fontSize: 20, fontWeight: '800', color: colors.text } as TextStyle,
  body: { fontSize: 16, color: colors.text } as TextStyle,
  muted: { fontSize: 15, color: colors.textMuted } as TextStyle,
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: colors.textMuted } as TextStyle,
  small: { fontSize: 13, color: colors.textMuted } as TextStyle,
};

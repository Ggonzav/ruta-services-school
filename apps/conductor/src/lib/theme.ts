import type { TextStyle, ViewStyle } from 'react-native';

// Tokens visuales de la app del conductor.
// Identidad RutaSegura: navy + amarillo de furgón escolar.
export const colors = {
  bg: '#F3F6FB',
  card: '#FFFFFF',
  cardBorder: '#E2E7F0',
  text: '#1B2340',
  textMuted: '#66728A',
  accent: '#1B2A5B',
  accentSoft: '#EEF2FB',
  blue: '#1B2A5B',
  navy: '#1B2A5B',
  yellow: '#FFB703',
  success: '#19B96B',
  successBg: '#E8F8EF',
  danger: '#C2453C',
  dangerBg: '#F6DED9',
  chipBg: '#FFF4D6',
  white: '#FFFFFF',
} as const;

// Escala de espaciado y radios — se usan con `gap` en flex en vez de
// márgenes sueltos, para que el ritmo vertical sea consistente.
export const space = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 16, xl: 22, pill: 999 } as const;

// Sombra suave para tarjetas y botones elevados (iOS + Android).
export const shadowCard: ViewStyle = {
  shadowColor: '#1B2A5B',
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

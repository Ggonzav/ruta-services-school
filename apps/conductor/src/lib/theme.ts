import type { TextStyle, ViewStyle } from 'react-native';

// Tokens visuales de RutaSegura. Los mismos valores viven en la web del
// apoderado (apps/web-apoderado/public/styles.css) para que las dos apps se
// lean como un mismo producto.
// Identidad "furgón escolar chileno": amarillo + negro, sobre fondo cálido.
// El amarillo (yellow) es la marca; la tinta (accent/blue) da la estructura y
// mantiene alto contraste (texto negro sobre amarillo, blanco sobre tinta).
export const colors = {
  bg: '#F7F4EC',
  card: '#FFFFFF',
  cardBorder: '#E9E3D5',
  text: '#1C1B17',
  textMuted: '#6B6657',
  accent: '#1C1B17',
  accentSoft: '#FFF4D6',
  blue: '#1C1B17',
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
  shadowColor: '#1C1B17',
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

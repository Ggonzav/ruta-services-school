import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, radius, shadowCard, space, typography } from '@/lib/theme';

// Sistema de componentes de la app del conductor. Las pantallas se arman
// con estas piezas en vez de repetir estilos inline, para que todo se vea
// consistente y sea fácil de ajustar en un solo lugar.

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg, paddingTop: 56, paddingHorizontal: 20, gap: space.lg }, style]}>
      {children}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export function Spacer() {
  return <View style={{ flexGrow: 1 }} />;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={typography.label}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.cardBorder,
          borderRadius: radius.xl,
          padding: 16,
        },
        shadowCard,
        style,
      ]}
    >
      {children}
    </View>
  );
}

type ButtonVariant = 'primary' | 'success' | 'danger' | 'ghost' | 'neutralGhost';

const buttonPalette: Record<ButtonVariant, { bg: string; fg: string; border?: string; spinner: string }> = {
  primary: { bg: colors.accent, fg: colors.white, spinner: colors.white },
  success: { bg: colors.success, fg: colors.white, spinner: colors.white },
  danger: { bg: colors.dangerBg, fg: colors.danger, spinner: colors.danger },
  ghost: { bg: 'transparent', fg: colors.accent, border: colors.accent, spinner: colors.accent },
  neutralGhost: { bg: 'transparent', fg: colors.textMuted, border: colors.textMuted, spinner: colors.textMuted },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'lg' | 'md';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = buttonPalette[variant];
  const isOff = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isOff}
      style={({ pressed }) => [
        {
          minHeight: size === 'lg' ? 60 : 52,
          borderRadius: radius.lg,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 14,
          backgroundColor: p.bg,
          borderWidth: p.border ? 2 : 0,
          borderColor: p.border,
          opacity: isOff ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.spinner} />
      ) : (
        <Text style={{ color: p.fg, fontSize: size === 'lg' ? 18 : 16, fontWeight: '800' }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={typography.label}>{label.toUpperCase()}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={{
          height: 52,
          borderWidth: 1.5,
          borderColor: colors.cardBorder,
          borderRadius: radius.md,
          paddingHorizontal: 14,
          fontSize: 16,
          backgroundColor: colors.card,
          color: colors.text,
        }}
        {...input}
      />
    </View>
  );
}

export function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.chipBg, borderRadius: radius.md, padding: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? colors.blue : 'transparent',
            }}
          >
            <Text style={{ color: active ? colors.white : colors.text, fontWeight: '700', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Pill({ label }: { label: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'flex-start',
        backgroundColor: colors.accent,
        borderRadius: radius.pill,
        paddingHorizontal: 14,
        paddingVertical: 8,
      }}
    >
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.success }} />
      <Text style={{ color: colors.white, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </View>
  );
}

export function Badge({ label, tone = 'success' }: { label: string; tone?: 'success' | 'muted' }) {
  const bg = tone === 'success' ? colors.successBg : colors.chipBg;
  const fg = tone === 'success' ? colors.success : colors.accent;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: fg }}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, size = 82 }: { name: string; size?: number }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.blue,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.white, fontWeight: '800', fontSize: size * 0.42 }}>{initial}</Text>
    </View>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted }}>Progreso</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted }}>
          {done} / {total}
        </Text>
      </View>
      <View style={{ height: 8, backgroundColor: colors.chipBg, borderRadius: radius.pill, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.success, borderRadius: radius.pill }} />
      </View>
    </View>
  );
}

export function Snackbar({ text, actionLabel, onAction }: { text: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View
      style={[
        {
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: 28,
          backgroundColor: colors.text,
          borderRadius: radius.md,
          paddingVertical: 14,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        shadowCard,
      ]}
    >
      <Text style={{ color: colors.white, fontWeight: '600', fontSize: 13, flexShrink: 1 }}>{text}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ color: colors.yellow, fontWeight: '800', fontSize: 13, paddingLeft: 12 }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={{ color: colors.danger, fontSize: 14 }}>{children}</Text>;
}

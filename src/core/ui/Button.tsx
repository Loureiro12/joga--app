import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Spinner } from '@/core/animation/loops';
import { colors, radii } from '@/core/theme';

import { PressableScale } from './PressableScale';
import { Display } from './Txt';

export type ButtonVariant =
  | 'primary'
  | 'action'
  | 'onColor'
  | 'onColorDark'
  | 'secondary'
  | 'tertiary'
  | 'translucent'
  | 'success'
  | 'destructive'
  | 'destructiveText';

const VARIANTS: Record<ButtonVariant, { bg: string; fg: string }> = {
  primary: { bg: colors.primary, fg: colors.text },
  action: { bg: colors.accent, fg: colors.background },
  onColor: { bg: colors.text, fg: colors.background },
  onColorDark: { bg: colors.background, fg: colors.text },
  secondary: { bg: colors.surface, fg: colors.text },
  tertiary: { bg: colors.surfaceLight, fg: colors.text },
  translucent: { bg: colors.overlayDark, fg: colors.text },
  success: { bg: colors.success, fg: colors.background },
  destructive: { bg: colors.danger, fg: colors.text },
  destructiveText: { bg: colors.surface, fg: colors.danger },
};

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Desabilitado: o rótulo deve explicar o motivo ("Mínimo 3 jogadores"). */
  disabled?: boolean;
  loading?: boolean;
  height?: number;
  fontSize?: number;
  radius?: number;
  left?: ReactNode;
  /** Sobrescreve a cor do rótulo (ex.: "Sair da partida" em vermelho). */
  textColor?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  height = 58,
  fontSize = 22,
  radius = radii.button,
  left,
  textColor,
  style,
}: Props) {
  const base = disabled ? { bg: colors.surfaceLight, fg: colors.muted } : VARIANTS[variant];
  const v = { bg: base.bg, fg: (!disabled && textColor) || base.fg };
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        {
          height,
          borderRadius: radius,
          backgroundColor: v.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingHorizontal: 12,
        },
        style,
      ]}
    >
      {loading ? <Spinner size={20} color={v.fg} track="rgba(250,250,250,0.3)" duration={800} /> : left}
      <Display font="display700" size={fontSize} ls={0.5} color={v.fg} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Display>
    </PressableScale>
  );
}

/** Botão inerte com spinner: "Aguardando o host começar". */
export function WaitingButton({ label }: { label: string }) {
  return (
    <View
      accessibilityRole="text"
      style={{
        height: 58,
        borderRadius: radii.button,
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 12,
      }}
    >
      <Spinner size={18} />
      <Display font="display700" size={20} ls={0.5} color={colors.muted} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Display>
    </View>
  );
}

/** Botão pill (badge-botão 17): "Jogar agora", "Copiar link", "Premium". */
export function PillButton({
  label,
  onPress,
  bg = colors.text,
  fg = colors.background,
  size = 17,
  padX = 18,
  padY = 12,
}: {
  label: string;
  onPress?: () => void;
  bg?: string;
  fg?: string;
  size?: number;
  padX?: number;
  padY?: number;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      pressedScale={0.96}
      style={{ backgroundColor: bg, borderRadius: radii.pill, paddingHorizontal: padX, paddingVertical: padY }}
    >
      <Display font="display700" size={size} ls={0.3} color={fg}>
        {label}
      </Display>
    </PressableScale>
  );
}

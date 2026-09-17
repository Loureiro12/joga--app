import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts, type FontToken } from '@/core/theme';

export type TxtProps = TextProps & {
  font?: FontToken;
  size?: number;
  /** Multiplicador de line-height (como no CSS). */
  lh?: number;
  color?: string;
  upper?: boolean;
  ls?: number;
  center?: boolean;
  opacity?: number;
  tabular?: boolean;
};

/** Texto base. Todo texto do app passa por aqui para garantir fonte e cor do design system. */
export function Txt({
  font = 'body500',
  size = 16,
  lh,
  color = colors.text,
  upper,
  ls,
  center,
  opacity,
  tabular,
  style,
  ...rest
}: TxtProps) {
  const base: TextStyle = {
    fontFamily: fonts[font],
    fontSize: size,
    color,
    letterSpacing: ls,
    textTransform: upper ? 'uppercase' : undefined,
    textAlign: center ? 'center' : undefined,
    opacity,
    fontVariant: tabular ? ['tabular-nums'] : undefined,
    includeFontPadding: false,
  };
  if (lh) base.lineHeight = Math.round(size * lh);
  return <Text {...rest} style={[base, style]} />;
}

/**
 * Títulos/números em Barlow Condensed caixa alta.
 * O design usa line-height .9–.95; no RN isso corta acentos (Ê, É), então o piso é 1.
 */
export function Display({ lh = 1, font = 'display800', upper = true, ...rest }: TxtProps) {
  return <Txt font={font} upper={upper} lh={Math.max(lh, 1)} {...rest} />;
}

/** Overline 11/600, caixa alta, muted. */
export function Overline({ color = colors.muted, ...rest }: TxtProps) {
  return <Txt font="body600" size={11} ls={0.8} upper color={color} {...rest} />;
}

import { View } from 'react-native';
import Svg, { Circle, Ellipse, Rect } from 'react-native-svg';

import { colors } from '@/core/theme';
import { Display } from '@/core/ui/Txt';

/** Símbolo: quadrado arredondado roxo (raio 30%) com o olho. viewBox 40. */
export function LogoSymbol({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Rect width={40} height={40} rx={12} fill={colors.primary} />
      <Ellipse cx={20} cy={20} rx={14} ry={9} fill={colors.text} />
      <Circle cx={23} cy={20} r={5.5} fill={colors.background} />
      <Circle cx={25} cy={18} r={1.8} fill={colors.accent} />
    </Svg>
  );
}

/** Wordmark "JOGAÊ" — o Ê é amarelo (roxo sobre fundo claro). */
export function Wordmark({
  size,
  color = colors.text,
  accent = colors.accent,
}: {
  size: number;
  color?: string;
  accent?: string;
}) {
  return (
    <Display size={size} ls={-0.3} color={color} lh={1.15}>
      Joga<Display size={size} ls={-0.3} color={accent} lh={1.15}>ê</Display>
    </Display>
  );
}

/** Símbolo + wordmark lado a lado (headers de onboarding e login). */
export function LogoLockup({ color, accent }: { color?: string; accent?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <LogoSymbol size={26} />
      <Wordmark size={22} color={color} accent={accent} />
    </View>
  );
}

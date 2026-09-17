import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { colors } from '@/core/theme';

type TwoTone = { size: number; color?: string; detail?: string };

/** Dado (sorteio). viewBox 60. */
export function Dice({ size, color = colors.accent, detail = colors.background }: TwoTone) {
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60">
      <Rect x={4} y={4} width={52} height={52} rx={14} fill={color} />
      {[
        [18, 18],
        [42, 18],
        [30, 30],
        [18, 42],
        [42, 42],
      ].map(([cx, cy]) => (
        <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={5} fill={detail} />
      ))}
    </Svg>
  );
}

/** Troféu (placar). viewBox 60. */
export function Trophy({ size, color = colors.accent }: { size: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60">
      <Path d="M16 6h28v14a14 14 0 0 1-28 0z" fill={color} />
      <Path d="M10 10h6v8a6 6 0 0 1-6-6zM44 10h6v2a6 6 0 0 1-6 6z" fill={color} />
      <Rect x={26} y={32} width={8} height={10} fill={color} />
      <Rect x={16} y={42} width={28} height={8} rx={3} fill={color} />
    </Svg>
  );
}

/** Máscara (Desafio secreto). viewBox 90×50. `detail` = cor do card por trás. */
export function Mask({ width, color = colors.background, detail = colors.success }: { width: number; color?: string; detail?: string }) {
  return (
    <Svg width={width} height={(width * 50) / 90} viewBox="0 0 90 50">
      <Path d="M2 14 Q45 -6 88 14 L82 40 Q45 52 8 40 Z" fill={color} />
      <Ellipse cx={30} cy={26} rx={12} ry={7} fill={detail} />
      <Ellipse cx={60} cy={26} rx={12} ry={7} fill={detail} />
    </Svg>
  );
}

/** Pill + seta (Quem é mais provável?). viewBox 80×60. */
export function PillArrow({ width, color = colors.background, detail = colors.accent }: { width: number; color?: string; detail?: string }) {
  return (
    <Svg width={width} height={(width * 60) / 80} viewBox="0 0 80 60">
      <Rect x={4} y={24} width={52} height={20} rx={10} fill={color} />
      <Path d="M50 20 L78 34 L50 48 Z" fill={color} />
      <Circle cx={14} cy={34} r={4} fill={detail} />
    </Svg>
  );
}

/** Bomba (Bomba-relógio). viewBox 60. */
export function Bomb({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 -4 60 64">
      <Circle cx={28} cy={34} r={22} fill={colors.background} />
      <Rect x={24} y={4} width={8} height={12} rx={2} fill={colors.background} />
      <Path d="M28 4 Q40 -2 46 8" stroke={colors.accent} strokeWidth={3} fill="none" />
      <Circle cx={20} cy={28} r={4} fill={colors.danger} opacity={0.6} />
    </Svg>
  );
}

/** Olho único do secret card. viewBox 100. */
export function SingleEye({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Ellipse cx={50} cy={50} rx={42} ry={26} fill={colors.text} />
      <Circle cx={50} cy={52} r={14} fill={colors.background} />
      <Circle cx={55} cy={47} r={4} fill={colors.text} />
    </Svg>
  );
}

/** QR estilizado (fallback quando não há payload real). */
export function FakeQr({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 84 84">
      <Path
        fill={colors.background}
        d="M0 0h28v28H0zM8 8h12v12H8zM56 0h28v28H56zM64 8h12v12H64zM0 56h28v28H0zM8 64h12v12H8zM36 0h8v8h-8zM36 16h8v12h-8zM32 36h8v8h-8zM48 32h12v8H48zM64 36h8v12h-8zM76 32h8v8h-8zM36 48h12v8H36zM56 56h8v8h-8zM72 56h12v8H72zM56 72h8v12h-8zM72 72h12v12H72zM36 64h8v8h-8zM32 76h12v8H32zM0 36h8v8H0zM16 40h8v8h-8z"
      />
      <Path fill={colors.text} d="M10 10h8v8h-8zM66 10h8v8h-8zM10 66h8v8h-8z" />
    </Svg>
  );
}

import type { ReactNode } from 'react';
import { View, type DimensionValue } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Enter } from '@/core/animation/Enter';
import { Shimmer } from '@/core/animation/loops';
import { Eyes } from '@/core/illustrations/Eyes';
import { colors } from '@/core/theme';

import { Button, PillButton } from './Button';
import { Display, Txt } from './Txt';

/** Bloco de skeleton `surfaceLight` com shimmer. */
export function Skeleton({ width = '100%', height = 16, radius = 8 }: { width?: DimensionValue; height?: number; radius?: number }) {
  return <Shimmer style={{ width, height, borderRadius: radius, backgroundColor: colors.surfaceLight }} />;
}

/** Empty state: ícone em quadrado 56 raio 18, título Barlow 22, apoio 13, CTA pill roxo. */
export function EmptyState({
  icon,
  title,
  subtitle,
  ctaLabel,
  onCta,
}: {
  icon: string;
  title: string;
  subtitle: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          backgroundColor: colors.surfaceLight,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Txt size={24}>{icon}</Txt>
      </View>
      <Display size={22} center>
        {title}
      </Display>
      <Txt font="body400" size={13} lh={1.4} color={colors.muted} center style={{ maxWidth: 260 }}>
        {subtitle}
      </Txt>
      {!!ctaLabel && <PillButton label={ctaLabel} onPress={onCta} bg={colors.primary} fg={colors.text} size={16} />}
    </View>
  );
}

/** Error state: olhos olhando para baixo, título, apoio, "Tentar de novo". */
export function ErrorState({
  title = 'Algo deu errado',
  subtitle = 'Não foi culpa sua. Tenta de novo em instantes.',
  onRetry,
  children,
}: {
  title?: string;
  subtitle?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <Enter kind="pop" style={{ alignItems: 'center', gap: 18 }}>
      <Eyes width={200} variant="down" />
      <Display size={40} center>
        {title}
      </Display>
      <Txt size={15} lh={1.45} color={colors.muted} center style={{ maxWidth: 290 }}>
        {subtitle}
      </Txt>
      {children}
      {onRetry && <Button label="Tentar de novo" onPress={onRetry} style={{ alignSelf: 'stretch' }} />}
    </Enter>
  );
}

/**
 * Anel de progresso (substitui o conic-gradient do protótipo).
 * `progress` 0–1, sentido horário a partir do topo.
 */
export function ProgressRing({
  size,
  thickness,
  progress,
  color,
  track = colors.surfaceLight,
  children,
}: {
  size: number;
  thickness: number;
  progress: number;
  color: string;
  track?: string;
  children?: ReactNode;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={thickness} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={thickness}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - clamped)}
        />
      </Svg>
      {children}
    </View>
  );
}

/** Progresso de rodadas: barras 6 pill — feitas roxo, atual amarelo, futuras surfaceLight. */
export function RoundProgress({ total, current }: { total: number; current: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`Rodada ${current} de ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            backgroundColor: i + 1 < current ? colors.primary : i + 1 === current ? colors.accent : colors.surfaceLight,
          }}
        />
      ))}
    </View>
  );
}

import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Enter, easings } from '@/core/animation/Enter';
import { Dots } from '@/core/animation/loops';
import { colors, radii } from '@/core/theme';
import { Avatar, Badge, CheckCircle, Display, EmptyAvatar, Txt } from '@/core/ui';
import { formatPoints } from '@/core/utils/format';

import type { Player } from '@jogae/engine';

/* ---------------------------------------------------------- Player card */

export function PlayerCard({ player, label, badge, highlight }: { player: Player; label?: string; badge?: 'host' | 'you'; highlight?: boolean }) {
  const offline = !player.connected;
  return (
    <Enter duration={450}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: colors.surface,
          borderRadius: radii.input,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderWidth: 1,
          borderColor: highlight ? colors.primary : colors.surface,
          opacity: offline ? 0.6 : 1,
        }}
      >
        <Avatar name={player.name} color={player.color} size={40} />
        <Txt font="body600" size={16} style={{ flex: 1 }} numberOfLines={1}>
          {label ?? player.name}
        </Txt>
        {offline ? (
          <Txt font="body600" size={12} color={colors.danger}>
            Desconectou
          </Txt>
        ) : badge === 'host' ? (
          <Badge label="Host" kind="host" />
        ) : badge === 'you' ? (
          <Badge label="Você" kind="you" />
        ) : (
          <CheckCircle size={24} />
        )}
      </View>
    </Enter>
  );
}

export function WaitingSlot() {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: radii.input,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.surfaceLight,
      }}
    >
      <EmptyAvatar size={40} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
        <Txt size={15} color={colors.muted}>
          Aguardando
        </Txt>
        <View style={{ paddingBottom: 4 }}>
          <Dots size={3} gap={3} color={colors.muted} cycle={1200} />
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ Vote card */

export function VoteCard({ player, selected, onPress }: { player: Player; selected: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withTiming(selected ? 1.03 : 1, { duration: 180 });
  }, [selected, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[{ flex: 1 }, animated]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`Votar em ${player.name}`}
        onPress={onPress}
        style={{
          backgroundColor: selected ? colors.surfaceLight : colors.surface,
          borderWidth: 2,
          borderColor: selected ? colors.accent : 'transparent',
          borderRadius: radii.card,
          paddingVertical: 20,
          paddingHorizontal: 16,
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Avatar name={player.name} color={player.color} size={64} />
        <Display size={22} numberOfLines={1}>
          {player.name}
        </Display>
        {selected && (
          <View style={{ position: 'absolute', top: 12, right: 12 }}>
            <CheckCircle size={26} color={colors.accent} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

/* ---------------------------------------------------------- Ranking row */

const MEDALS = ['🥇', '🥈', '🥉'];

export function RankingRow({ position, player, name, points, delta, index }: { position: number; player: Player; name: string; points: number; delta: number; index: number }) {
  const medal = MEDALS[position - 1];
  return (
    <Enter delay={index * 70}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: position === 1 ? colors.surfaceLight : colors.surface,
          borderRadius: radii.list,
          paddingVertical: 14,
          paddingHorizontal: 16,
        }}
      >
        <Display size={22} center color={medal ? colors.text : colors.muted} style={{ width: 30 }}>
          {medal ?? `${position}º`}
        </Display>
        <Avatar name={player.name} color={player.color} size={44} />
        <View style={{ flex: 1 }}>
          <Txt font="body700" size={18} numberOfLines={1}>
            {name}
          </Txt>
          <Txt size={12} color={delta > 0 ? colors.success : colors.muted}>
            +{delta} nesta rodada
          </Txt>
        </View>
        <Display size={26} tabular>
          {formatPoints(points)}
          <Display size={14} color={colors.muted}>
            {' '}
            pts
          </Display>
        </Display>
      </View>
    </Enter>
  );
}

/* -------------------------------------------------------------- Vote bar */

/** Barra 12 pill; anima a largura em 800 ms com delay 400 ms. */
export function VoteBar({ ratio, highlight }: { ratio: number; highlight: boolean }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(400, withTiming(ratio, { duration: 800, easing: easings.out }));
  }, [ratio, w]);
  const animated = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={{ flex: 1, height: 12, borderRadius: 6, backgroundColor: 'rgba(250,250,250,0.15)', overflow: 'hidden' }}>
      <Animated.View
        style={[{ height: '100%', borderRadius: 6, backgroundColor: highlight ? colors.accent : 'rgba(250,250,250,0.6)' }, animated]}
      />
    </View>
  );
}

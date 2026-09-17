import { useEffect } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, radii } from '@/core/theme';

import { Display, Txt } from './Txt';

/* ------------------------------------------------------------------ Chip */

type ChipProps = {
  label: string;
  emoji?: string;
  /** default · selected (roxo) · filterActive (branco) · locked (🔒) · info (surface sem borda) · soft (surfaceLight) */
  state?: 'default' | 'selected' | 'filterActive' | 'locked' | 'info' | 'soft' | 'translucent';
  size?: 'md' | 'sm';
  onPress?: () => void;
};

export function Chip({ label, emoji, state = 'default', size = 'md', onPress }: ChipProps) {
  const palette = {
    default: { bg: colors.surface, border: colors.surfaceLight, fg: colors.text },
    selected: { bg: colors.primary, border: colors.primary, fg: colors.text },
    filterActive: { bg: colors.text, border: colors.surfaceLight, fg: colors.background },
    locked: { bg: colors.surface, border: colors.surfaceLight, fg: colors.mutedDark },
    info: { bg: colors.surface, border: colors.surface, fg: colors.text },
    soft: { bg: colors.surfaceLight, border: colors.surfaceLight, fg: colors.text },
    translucent: { bg: colors.overlayDarkSoft, border: 'transparent', fg: colors.text },
  }[state];
  const md = size === 'md';
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: state === 'selected' || state === 'filterActive', disabled: state === 'locked' }}
      disabled={!onPress || state === 'locked'}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: palette.bg,
        borderColor: palette.border,
        borderWidth: 1,
        borderRadius: radii.pill,
        paddingVertical: md ? 10 : 8,
        paddingHorizontal: md ? 14 : 12,
      }}
    >
      {!!emoji && <Txt size={md ? 15 : 13}>{emoji}</Txt>}
      <Txt font="body600" size={md ? 15 : 13} color={palette.fg}>
        {label}
      </Txt>
      {state === 'locked' && <Txt size={12}>🔒</Txt>}
    </Pressable>
  );
}

/* ----------------------------------------------------------------- Badge */

type BadgeKind = 'host' | 'hot' | 'category' | 'new' | 'premium' | 'premiumSolid' | 'onColor' | 'you';

export function Badge({ label, kind = 'category', size = 10 }: { label: string; kind?: BadgeKind; size?: number }) {
  const p = {
    host: { bg: colors.primary, fg: colors.text, border: undefined },
    hot: { bg: colors.accent, fg: colors.background, border: undefined },
    category: { bg: colors.surfaceLight, fg: colors.muted, border: undefined },
    you: { bg: colors.surfaceLight, fg: colors.text, border: undefined },
    new: { bg: colors.success, fg: colors.background, border: undefined },
    premium: { bg: colors.background, fg: colors.primaryLight, border: colors.primaryLight },
    premiumSolid: { bg: colors.primary, fg: colors.text, border: undefined },
    onColor: { bg: colors.overlayDark, fg: colors.text, border: undefined },
  }[kind];
  return (
    <View
      style={{
        backgroundColor: p.bg,
        borderRadius: radii.pill,
        paddingVertical: 5,
        paddingHorizontal: 8,
        borderWidth: p.border ? 1 : 0,
        borderColor: p.border,
        alignSelf: 'flex-start',
      }}
    >
      <Txt font="body600" size={size} ls={0.6} upper color={p.fg}>
        {label}
      </Txt>
    </View>
  );
}

/* --------------------------------------------------------------- Stepper */

function StepButton({ symbol, onPress, disabled, label }: { symbol: string; onPress: () => void; disabled: boolean; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: pressed ? colors.primary : colors.surfaceLight,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Display font="display700" size={26} lh={1.1}>
        {symbol}
      </Display>
    </Pressable>
  );
}

export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <StepButton symbol="−" label="Diminuir" disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))} />
      <Display size={40} center tabular style={{ minWidth: 44 }}>
        {value}
      </Display>
      <StepButton symbol="+" label="Aumentar" disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} />
    </View>
  );
}

/* ------------------------------------------------------------- Segmented */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  itemHeight = 44,
  fontSize = 18,
  font = 'display700',
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  itemHeight?: number;
  fontSize?: number;
  font?: 'display700' | 'display800';
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.surface, padding: 6, borderRadius: radii.button }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              height: itemHeight,
              borderRadius: radii.segmentItem,
              backgroundColor: active ? colors.primary : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Display font={font} size={fontSize}>
              {o.label}
            </Display>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------------------------------------------------------- Toggle */

/** Toggle 50×30, knob 24 branco, on roxo / off surfaceLight. */
export function Toggle({ value, style }: { value: boolean; style?: StyleProp<ViewStyle> }) {
  const p = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    p.value = withTiming(value ? 1 : 0, { duration: 200 });
  }, [value, p]);
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [colors.surfaceLight, colors.primary]),
  }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: 3 + p.value * 20 }] }));
  return (
    <Animated.View style={[{ width: 50, height: 30, borderRadius: 15, justifyContent: 'center' }, track, style]}>
      <Animated.View style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.text }, knob]} />
    </Animated.View>
  );
}

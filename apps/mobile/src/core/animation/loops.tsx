import { useEffect, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/core/theme';

/** `pulse`: scale 1↔1.04 em 2,4 s (secret card fechado). */
export function Pulse({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    return () => cancelAnimation(s);
  }, [s]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** `shake`: translateX 0,−6,6,−4,4,0 em 400 ms. Dispara a cada mudança de `trigger`. */
export function Shake({
  trigger,
  children,
  style,
}: {
  trigger: unknown;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const x = useSharedValue(0);
  useEffect(() => {
    const step = { duration: 80 };
    x.value = withSequence(
      withTiming(-6, step),
      withTiming(6, step),
      withTiming(-4, step),
      withTiming(4, step),
      withTiming(0, step),
    );
  }, [trigger, x]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

function Dot({ index, size, color, cycle }: { index: number; size: number; color: string; cycle: number }) {
  const o = useSharedValue(0.2);
  useEffect(() => {
    o.value = withDelay(
      index * 200,
      withRepeat(
        withSequence(
          withTiming(1, { duration: cycle * 0.4 }),
          withTiming(0.2, { duration: cycle * 0.4 }),
          withTiming(0.2, { duration: cycle * 0.2 }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(o);
  }, [o, index, cycle]);
  const animated = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, animated]}
    />
  );
}

/** `dots`: três pontos com opacity .2↔1 escalonada em .2 s. */
export function Dots({ size = 8, gap = 8, color = colors.accent, cycle = 1000 }: { size?: number; gap?: number; color?: string; cycle?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} index={i} size={size} color={color} cycle={cycle} />
      ))}
    </View>
  );
}

/** Spinner em anel: borda `track` com topo `color`, girando. */
export function Spinner({
  size = 18,
  thickness = 3,
  color = colors.accent,
  track = colors.surfaceLight,
  duration = 1000,
}: { size?: number; thickness?: number; color?: string; track?: string; duration?: number }) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withRepeat(withTiming(360, { duration, easing: Easing.linear }), -1);
    return () => cancelAnimation(r);
  }, [r, duration]);
  const animated = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: thickness,
          borderColor: track,
          borderTopColor: color,
        },
        animated,
      ]}
    />
  );
}

/** Shimmer do skeleton: opacity .5↔1 em 1,4 s. */
export function Shimmer({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0.5, { duration: 700 })),
      -1,
    );
    return () => cancelAnimation(o);
  }, [o]);
  const animated = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

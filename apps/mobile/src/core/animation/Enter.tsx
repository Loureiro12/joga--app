import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export const easings = {
  /** cubic-bezier(.2,.8,.2,1) — `in` */
  out: Easing.bezier(0.2, 0.8, 0.2, 1),
  /** cubic-bezier(.2,.9,.3,1.3) — `pop` (overshoot) */
  pop: Easing.bezier(0.2, 0.9, 0.3, 1.3),
};

type Props = {
  /** `in`: fade + sobe 14px + scale .96→1. `pop`: scale .6→1.06→1 com rotação −6°→1°→0. */
  kind?: 'in' | 'pop';
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/** Animação de entrada do design system. Remonte (via `key`) para repetir. */
export function Enter({ kind = 'in', delay = 0, duration, style, children }: Props) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(kind === 'in' ? 14 : 0);
  const scale = useSharedValue(kind === 'in' ? 0.96 : 0.6);
  const rotate = useSharedValue(kind === 'pop' ? -6 : 0);

  useEffect(() => {
    if (kind === 'in') {
      const d = duration ?? 500;
      const cfg = { duration: d, easing: easings.out };
      opacity.value = withDelay(delay, withTiming(1, cfg));
      translateY.value = withDelay(delay, withTiming(0, cfg));
      scale.value = withDelay(delay, withTiming(1, cfg));
    } else {
      const d = duration ?? 650;
      const a = { duration: d * 0.6, easing: easings.pop };
      const b = { duration: d * 0.4, easing: Easing.out(Easing.quad) };
      opacity.value = withDelay(delay, withTiming(1, { duration: d * 0.5 }));
      scale.value = withDelay(delay, withSequence(withTiming(1.06, a), withTiming(1, b)));
      rotate.value = withDelay(delay, withSequence(withTiming(1, a), withTiming(0, b)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

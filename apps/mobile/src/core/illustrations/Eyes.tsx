import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse } from 'react-native-svg';

import { colors } from '@/core/theme';

type Props = {
  width: number;
  /** `default`: olhando para o lado · `danger`: íris vermelha (impostor) · `down`: olhando para baixo (erro). */
  variant?: 'default' | 'danger' | 'down';
  /** Ciclo do blink em ms (4–5 s). 0 desliga. */
  blinkCycle?: number;
};

/** Ilustração "olhos" do Impostor. viewBox 200×120. */
export function Eyes({ width, variant = 'default', blinkCycle = 0 }: Props) {
  const height = (width * 120) / 200;
  const scaleY = useSharedValue(1);

  useEffect(() => {
    if (!blinkCycle) return;
    // blink: scaleY 1→.1→1 nos 8% finais do ciclo.
    scaleY.value = withRepeat(
      withSequence(
        withDelay(blinkCycle * 0.92, withTiming(0.1, { duration: blinkCycle * 0.04 })),
        withTiming(1, { duration: blinkCycle * 0.04 }),
      ),
      -1,
    );
    return () => cancelAnimation(scaleY);
  }, [blinkCycle, scaleY]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scaleY: scaleY.value }] }));

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox="0 0 200 120">
        <Ellipse cx={60} cy={60} rx={52} ry={34} fill={colors.text} />
        <Ellipse cx={150} cy={60} rx={52} ry={34} fill={colors.text} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, animated]}>
        <Svg width={width} height={height} viewBox="0 0 200 120">
          {variant === 'default' && (
            <>
              <Circle cx={76} cy={62} r={17} fill={colors.background} />
              <Circle cx={166} cy={62} r={17} fill={colors.background} />
              <Circle cx={82} cy={56} r={5} fill={colors.text} />
              <Circle cx={172} cy={56} r={5} fill={colors.text} />
            </>
          )}
          {variant === 'danger' && (
            <>
              <Circle cx={60} cy={62} r={17} fill={colors.danger} />
              <Circle cx={150} cy={62} r={17} fill={colors.danger} />
              <Circle cx={60} cy={62} r={8} fill={colors.background} />
              <Circle cx={150} cy={62} r={8} fill={colors.background} />
            </>
          )}
          {variant === 'down' && (
            <>
              <Circle cx={60} cy={72} r={17} fill={colors.background} />
              <Circle cx={150} cy={72} r={17} fill={colors.background} />
            </>
          )}
        </Svg>
      </Animated.View>
    </View>
  );
}

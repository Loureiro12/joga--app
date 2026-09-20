import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
import Svg, { Circle, Ellipse } from 'react-native-svg';

import { Enter } from '@/core/animation/Enter';
import { Dots } from '@/core/animation/loops';
import { Wordmark } from '@/core/illustrations';
import { routes } from '@/core/navigation/routes';
import { colors } from '@/core/theme';
import { Txt } from '@/core/ui';
import { useSessionStore } from '@/features/auth/sessionStore';

const EYE = 150;
const CYCLE = 2400;
const UNIT = EYE / 40;

/** Olho do splash: pupila olha para a direita e volta; pálpebra roxa pisca nos 12% finais do ciclo. */
function SplashEye() {
  const look = useSharedValue(0);
  const lid = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.inOut(Easing.ease);
    look.value = withDelay(
      600,
      withRepeat(
        withSequence(
          withTiming(0, { duration: CYCLE * 0.3 }),
          withTiming(5 * UNIT, { duration: CYCLE * 0.15, easing: ease }),
          withTiming(5 * UNIT, { duration: CYCLE * 0.2 }),
          withTiming(0, { duration: CYCLE * 0.15, easing: ease }),
          withTiming(0, { duration: CYCLE * 0.2 }),
        ),
        -1,
      ),
    );
    lid.value = withDelay(
      600,
      withRepeat(
        withSequence(
          withTiming(0, { duration: CYCLE * 0.88 }),
          withTiming(1, { duration: CYCLE * 0.05, easing: ease }),
          withTiming(0, { duration: CYCLE * 0.07, easing: ease }),
        ),
        -1,
      ),
    );
    return () => {
      cancelAnimation(look);
      cancelAnimation(lid);
    };
  }, [look, lid]);

  const pupilStyle = useAnimatedStyle(() => ({ transform: [{ translateX: look.value }] }));
  const lidStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: lid.value }] }));

  return (
    <View style={{ width: EYE, height: EYE }}>
      <Svg width={EYE} height={EYE} viewBox="0 0 40 40">
        <Ellipse cx={20} cy={20} rx={17} ry={11} fill={colors.text} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, pupilStyle]}>
        <Svg width={EYE} height={EYE} viewBox="0 0 40 40">
          <Circle cx={20} cy={20} r={6.5} fill={colors.background} />
          <Circle cx={22.5} cy={17.5} r={2.2} fill={colors.accent} />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, lidStyle]}>
        <Svg width={EYE} height={EYE} viewBox="0 0 40 40">
          <Ellipse cx={20} cy={20} rx={17.6} ry={11.6} fill={colors.primary} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Tela 1. Avança em 2,6 s ou ao tocar: Onboarding (1º uso) → Login (sem sessão) → Home. */
export function SplashScreen() {
  const ready = useSessionStore((s) => s.hydrated && s.authReady);
  const left = useRef(false);
  const minTimeDone = useRef(false);

  const advance = useCallback(() => {
    const { hydrated, authReady } = useSessionStore.getState();
    if (left.current || !hydrated || !authReady) return;
    left.current = true;
    const { hasOnboarded, user } = useSessionStore.getState();
    router.replace(!hasOnboarded ? routes.onboarding : user ? routes.home : routes.login);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      minTimeDone.current = true;
      advance();
    }, 2600);
    return () => clearTimeout(t);
  }, [advance]);

  // Se o storage ou a checagem de sessão demorarem mais que a animação, avança assim que ficarem prontos.
  useEffect(() => {
    if (ready && minTimeDone.current) advance();
  }, [ready, advance]);

  return (
    <Pressable
      accessibilityLabel="Jogaê. Toque para continuar"
      onPress={advance}
      style={{ flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', gap: 22 }}
    >
      <Enter kind="pop" duration={700}>
        <SplashEye />
      </Enter>
      <Enter delay={300} duration={600}>
        <Wordmark size={64} />
      </Enter>
      <Enter delay={500} duration={600}>
        <Txt size={15} opacity={0.8}>
          Bora jogar?
        </Txt>
      </Enter>
      <View style={{ position: 'absolute', bottom: 56, left: 0, right: 0, alignItems: 'center' }}>
        <Enter delay={800} duration={600}>
          <Dots size={8} gap={8} />
        </Enter>
      </View>
    </Pressable>
  );
}

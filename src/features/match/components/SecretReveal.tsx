import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Pulse } from '@/core/animation/loops';
import { SingleEye } from '@/core/illustrations';
import { colors, radii, shadows } from '@/core/theme';
import { Display } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';

/** ~0,8 s para preencher (2,5% a cada 20 ms no protótipo). */
const HOLD_MS = 800;

/** Secret card 250×340: pulse contínuo; cresce 1→1.06 e enche a barra conforme o hold. */
export function SecretCard({ progress }: { progress: SharedValue<number> }) {
  const grow = useAnimatedStyle(() => ({ transform: [{ scale: 1 + progress.value * 0.06 }] }));
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <Pulse>
      <Animated.View
        style={[
          { width: 250, height: 340, borderRadius: radii.cardLg, backgroundColor: colors.primary },
          shadows.secretCard,
          grow,
        ]}
      >
        <View style={{ flex: 1, borderRadius: radii.cardLg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              top: 14,
              left: 14,
              right: 14,
              bottom: 14,
              borderRadius: 18,
              borderWidth: 2,
              borderColor: 'rgba(250,250,250,0.25)',
            }}
          />
          <Display size={14} ls={2} opacity={0.8} style={{ position: 'absolute', top: 22 }}>
            Jogaê
          </Display>
          <SingleEye size={120} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, backgroundColor: colors.overlayDark }}>
            <Animated.View style={[{ height: '100%', backgroundColor: colors.accent }, bar]} />
          </View>
        </View>
      </Animated.View>
    </Pulse>
  );
}

/**
 * Botão "Segure para revelar": branco 64 raio 20; preenche amarelo da esquerda à direita.
 * Soltar antes zera. Haptic leve ao começar, forte ao completar.
 */
export function HoldToRevealButton({ progress, onComplete }: { progress: SharedValue<number>; onComplete: () => void }) {
  const [holding, setHolding] = useState(false);

  const start = () => {
    setHolding(true);
    haptics.light();
  };
  const complete = () => {
    haptics.heavy();
    onComplete();
  };
  const release = () => setHolding(false);

  const gesture = Gesture.LongPress()
    .minDuration(HOLD_MS)
    .maxDistance(10000)
    .onBegin(() => {
      progress.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear });
      scheduleOnRN(start);
    })
    .onStart(() => {
      scheduleOnRN(complete);
    })
    .onFinalize((_e, success) => {
      if (!success) {
        cancelAnimation(progress);
        progress.value = withTiming(0, { duration: 150 });
      }
      scheduleOnRN(release);
    });

  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityRole="button"
        accessibilityLabel="Segure para revelar seu papel"
        style={{
          height: 64,
          borderRadius: 20,
          backgroundColor: colors.text,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accent }, fill]} />
        <Display font="display700" size={22} ls={0.5} color={colors.background}>
          {holding ? 'Continue segurando…' : 'Segure para revelar'}
        </Display>
      </View>
    </GestureDetector>
  );
}

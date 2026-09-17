import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Enter } from '@/core/animation/Enter';
import { Dice, Eyes, LogoLockup, Trophy } from '@/core/illustrations';
import { routes } from '@/core/navigation/routes';
import { colors } from '@/core/theme';
import { Button, Display, Txt, useScreenPadding } from '@/core/ui';
import { useSessionStore } from '@/features/auth/sessionStore';

const STEPS = [
  {
    bg: colors.primary,
    title: 'Bora jogar?',
    sub: 'Escolha um jogo, crie a sala e chame o grupo. O app conduz as regras — vocês só se divertem.',
  },
  {
    bg: colors.accent,
    title: 'Todos no mesmo lugar.',
    sub: 'Cada um entra pelo próprio celular com um código. Papéis secretos, votações e revelações, sem spoiler.',
  },
  {
    bg: colors.success,
    title: 'Quem leva o troféu?',
    sub: 'Pontos a cada rodada, placar ao vivo e um campeão no fim da noite.',
  },
] as const;

/** Tela 2: Onboarding em 3 passos; o fundo muda de cor em 500 ms. */
export function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const pad = useScreenPadding();
  const progress = useSharedValue(0);
  const current = STEPS[step];
  const onLight = step !== 0;
  const fg = onLight ? colors.background : colors.text;
  const last = step === STEPS.length - 1;

  useEffect(() => {
    progress.value = withTiming(step, { duration: 500 });
  }, [step, progress]);

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1, 2], STEPS.map((s) => s.bg)),
  }));

  const finish = () => {
    useSessionStore.getState().completeOnboarding();
    router.replace(routes.login);
  };

  return (
    <Animated.View style={[{ flex: 1, gap: 18 }, pad, bgStyle]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <LogoLockup color={fg} accent={onLight ? colors.primary : colors.accent} />
        <Pressable accessibilityRole="button" onPress={finish} hitSlop={8} style={{ padding: 8 }}>
          <Txt font="body600" size={14} color={fg} opacity={0.8}>
            Pular
          </Txt>
        </Pressable>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', gap: 24 }}>
        <Enter key={`art-${step}`} kind="pop" duration={600} style={{ minHeight: 180, alignItems: 'center', justifyContent: 'center' }}>
          {step === 0 && <Eyes width={260} blinkCycle={4000} />}
          {step === 1 && <Dice size={180} color={colors.background} detail={colors.accent} />}
          {step === 2 && <Trophy size={180} color={colors.background} />}
        </Enter>
        <Enter key={`copy-${step}`}>
          <Display size={56} color={fg}>
            {current.title}
          </Display>
          <Txt size={17} lh={1.4} color={fg} opacity={0.85} style={{ marginTop: 14, maxWidth: 300 }}>
            {current.sub}
          </Txt>
        </Enter>
      </View>

      <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Passo ${step + 1} de ${STEPS.length}`}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={{
              height: 6,
              borderRadius: 3,
              width: i === step ? 28 : 8,
              backgroundColor: i === step ? fg : onLight ? 'rgba(15,15,19,0.3)' : 'rgba(250,250,250,0.3)',
            }}
          />
        ))}
      </View>

      <Button
        label={last ? 'Bora jogar' : 'Continuar'}
        variant={onLight ? 'onColorDark' : 'onColor'}
        onPress={() => (last ? finish() : setStep(step + 1))}
      />
    </Animated.View>
  );
}

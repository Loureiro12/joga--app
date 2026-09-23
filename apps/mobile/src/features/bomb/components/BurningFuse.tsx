import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { colors } from '@/core/theme';
import { Txt } from '@/core/ui';

/**
 * O nervosismo da rodada: pulso, brilho e tremor enquanto a bomba está acesa.
 *
 * **A regra que decide todo o desenho: nada aqui pode dizer quanto tempo falta.** Se a agitação
 * crescesse junto com o pavio, o grupo aprenderia a ler a tela em duas partidas e a incerteza —
 * que é o jogo inteiro — acabaria.
 *
 * Por isso este componente **não recebe nem consulta o instante da explosão**. Ele sorteia o
 * próprio ritmo, em ondas de calmaria e agitação que não têm relação nenhuma com a bomba. Às
 * vezes a tela se acalma um segundo antes de estourar; às vezes fica frenética e não acontece
 * nada. É exatamente esse descompasso que dá a sensação de risco.
 */

/** Cada onda dura de 2,5 a 5 s, e nada indica quando a próxima vem. */
const ONDA_MIN_MS = 2500;
const ONDA_MAX_MS = 5000;
/** Batida calma e batida nervosa. A distância entre as duas é o que se sente. */
const CALMO_MS = 900;
const AGITADO_MS = 330;

export function BurningFuse() {
  const batida = useSharedValue(0);
  const tremor = useSharedValue(0);

  useEffect(() => {
    let vivo = true;
    let proxima: ReturnType<typeof setTimeout> | undefined;

    /** Reagenda o próprio ritmo indefinidamente, sorteando calmaria e agitação. */
    const onda = () => {
      if (!vivo) return;
      const agitada = Math.random() < 0.45;
      const periodo = agitada ? AGITADO_MS : CALMO_MS;
      const duracao = ONDA_MIN_MS + Math.random() * (ONDA_MAX_MS - ONDA_MIN_MS);

      batida.value = withRepeat(
        withSequence(
          withTiming(1, { duration: periodo / 2, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: periodo / 2, easing: Easing.in(Easing.quad) }),
        ),
        -1,
      );
      // Só as ondas agitadas tremem, e de leve: o tranco forte fica reservado para o susto.
      tremor.value = agitada ? withRepeat(withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 70 })), -1) : withTiming(0, { duration: 200 });

      proxima = setTimeout(onda, duracao);
    };

    onda();
    return () => {
      vivo = false;
      clearTimeout(proxima);
      cancelAnimation(batida);
      cancelAnimation(tremor);
    };
  }, [batida, tremor]);

  const brilho = useAnimatedStyle(() => ({ opacity: 0.12 + batida.value * 0.3, transform: [{ scale: 0.9 + batida.value * 0.25 }] }));
  const chama = useAnimatedStyle(() => ({
    transform: [{ scale: 0.92 + batida.value * 0.28 }, { rotate: `${(tremor.value - 0.5) * 16}deg` }],
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: 64 }}>
      {/* Brasa por trás da chama: cresce e recua junto com a batida. */}
      <Animated.View
        style={[
          { position: 'absolute', width: 76, height: 76, borderRadius: 38, backgroundColor: colors.danger },
          brilho,
        ]}
      />
      <Animated.View style={chama}>
        <Txt size={34}>🔥</Txt>
      </Animated.View>
    </View>
  );
}

/** O mesmo pulso, para o bloco do desafio respirar junto com a chama. */
export function useBombPulse() {
  const escala = useSharedValue(1);

  useEffect(() => {
    let vivo = true;
    let proxima: ReturnType<typeof setTimeout> | undefined;
    const onda = () => {
      if (!vivo) return;
      const agitada = Math.random() < 0.45;
      const periodo = agitada ? AGITADO_MS : CALMO_MS;
      escala.value = withRepeat(
        withSequence(
          withTiming(agitada ? 1.02 : 1.01, { duration: periodo / 2, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: periodo / 2, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      );
      proxima = setTimeout(onda, ONDA_MIN_MS + Math.random() * (ONDA_MAX_MS - ONDA_MIN_MS));
    };
    onda();
    return () => {
      vivo = false;
      clearTimeout(proxima);
      cancelAnimation(escala);
    };
  }, [escala]);

  return useAnimatedStyle(() => ({ transform: [{ scale: escala.value }] }));
}

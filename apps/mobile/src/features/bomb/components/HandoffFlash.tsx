import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { colors } from '@/core/theme';
import { Display, Txt } from '@/core/ui';

/**
 * O aviso de quem recebeu a bomba.
 *
 * Só trocar o nome na tela não funciona: quem está com o celular acabou de tocar num botão,
 * está sob pressão, e a mudança sutil passa batido — a roda fica se perguntando "é a vez de
 * quem?". Então a passagem toma a tela inteira por meio segundo, na cor da pessoa.
 *
 * **Não bloqueia o toque** (`pointerEvents: none`): a bomba continua contando por baixo, e quem
 * recebeu não pode perder tempo esperando uma animação terminar para poder jogar.
 */

/** Tempo total na tela. Curto o bastante para não atrasar a jogada, longo para o olho pegar. */
const VISIVEL_MS = 520;

export function HandoffFlash({ name, color, letter, onDone }: { name: string; color: string; letter?: string; onDone: () => void }) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = 0;
    p.value = withSequence(
      withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }),
      withDelay(
        VISIVEL_MS - 280,
        withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) }, (fim) => {
          if (fim) runOnJS(onDone)();
        }),
      ),
    );
    return () => cancelAnimation(p);
    // Um flash por passagem: `name` e `letter` mudam juntos e reiniciam a animação.
  }, [name, letter, p, onDone]);

  const fundo = useAnimatedStyle(() => ({ opacity: p.value }));
  const conteudo = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: 0.88 + p.value * 0.12 }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: color }, fundo]}
    >
      <Animated.View style={[{ alignItems: 'center', gap: 2 }, conteudo]}>
        {/* No Alfabeto, a letra gasta aparece antes do nome: confirma a jogada de quem passou. */}
        {letter ? (
          <View style={{ alignItems: 'center', marginBottom: 10 }}>
            <Display size={92} color={colors.background}>
              ✓ {letter}
            </Display>
          </View>
        ) : null}
        <Txt font="body700" size={22} color={colors.background} style={{ opacity: 0.7 }}>
          ➜ agora é a vez de
        </Txt>
        {/* O nome é a informação da tela: ocupa a largura toda e só encolhe se não couber. */}
        <Display size={76} color={colors.background} center adjustsFontSizeToFit numberOfLines={1} style={{ paddingHorizontal: 20, alignSelf: 'stretch' }}>
          {name}
        </Display>
      </Animated.View>
    </Animated.View>
  );
}

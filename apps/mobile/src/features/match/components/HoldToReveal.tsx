import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Pressable, View } from 'react-native';

import { colors, radii } from '@/core/theme';
import { Display, Txt } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';

/**
 * "Segure para ver". O conteúdo só aparece enquanto o dedo está na tela.
 *
 * No Desafio Secreto todo mundo está fisicamente ao lado, olhando de esguelha. Um botão que
 * alterna deixaria a missão exposta no primeiro descuido — soltar o dedo é o gesto que devolve
 * o segredo, e ele é involuntário: a pessoa larga o celular e a missão some (§69).
 *
 * Some também quando o app vai para segundo plano, porque o seletor de apps mostra a última tela.
 */
export function HoldToReveal({ label = 'Segure para ver sua missão', children }: { label?: string; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const sub = AppState.addEventListener('change', (state) => state !== 'active' && setAberto(false));
    return () => sub.remove();
  }, [aberto]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Mantenha pressionado para ver, solte para esconder"
      onPressIn={() => {
        haptics.light();
        setAberto(true);
      }}
      onPressOut={() => setAberto(false)}
      style={{
        backgroundColor: aberto ? colors.surface : colors.surfaceLight,
        borderRadius: radii.card,
        minHeight: 190,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
      }}
    >
      {aberto ? (
        children
      ) : (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Txt size={38}>🔒</Txt>
          <Display size={22} center>
            {label}
          </Display>
          <Txt font="body400" size={12} lh={1.35} color={colors.muted} center style={{ maxWidth: 240 }}>
            Confira antes que ninguém esteja olhando. Ao soltar, some.
          </Txt>
        </View>
      )}
    </Pressable>
  );
}

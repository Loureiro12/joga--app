import { Pressable, View } from 'react-native';

import { colors, radii } from '@/core/theme';
import { Display } from '@/core/ui';

/**
 * A grade de letras. É o único controle da rodada: tocar a letra é falar "usei esta" e passar a
 * bomba, então o alvo precisa ser grande — a pessoa está sob pressão e mira sem olhar direito.
 *
 * A letra gasta continua na tela, apagada, em vez de sumir. Some, e a grade se reorganizaria a
 * cada toque, obrigando todo mundo a reaprender onde as letras estão bem na hora da pressa.
 *
 * `readOnly` é para a partida em sala: quem não está com a bomba continua vendo a grade — saber
 * quais letras já foram é do grupo —, mas não toca nela.
 */
export function LetterGrid({
  letters,
  used,
  onPick,
  readOnly = false,
}: {
  letters: string;
  used: Set<string>;
  onPick: (letter: string) => void;
  readOnly?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
      {[...letters].map((letra) => {
        const gasta = used.has(letra);
        const travada = gasta || readOnly;
        return (
          <Pressable
            key={letra}
            accessibilityRole="button"
            accessibilityLabel={gasta ? `Letra ${letra}, já usada` : `Usar a letra ${letra}`}
            accessibilityState={{ disabled: travada }}
            disabled={travada}
            onPress={() => onPick(letra)}
            style={({ pressed }) => ({
              width: 58,
              height: 58,
              borderRadius: radii.input,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: gasta ? 'transparent' : pressed && !readOnly ? colors.primaryLight : colors.surface,
              opacity: readOnly && !gasta ? 0.6 : 1,
              borderWidth: gasta ? 1 : 0,
              borderColor: colors.surfaceLight,
            })}
          >
            <Display size={26} color={gasta ? colors.mutedDark : colors.text}>
              {letra}
            </Display>
          </Pressable>
        );
      })}
    </View>
  );
}

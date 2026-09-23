import { router } from 'expo-router';
import { useRef } from 'react';
import { View, type TextInput } from 'react-native';

import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Button, Display, Input, Screen, Spacer, StackHeader, Txt } from '@/core/ui';

import { coupleActions, useCoupleNames } from '../coupleStore';

/**
 * Os dois nomes. É a tela mais curta do app de propósito: o jogo não é sobre configurar, e cada
 * campo a mais aqui é um minuto a menos de conversa.
 */
export function CoupleSetupScreen() {
  const names = useCoupleNames();
  const segundo = useRef<TextInput>(null);
  const prontos = names[0].trim().length > 0 && names[1].trim().length > 0;

  return (
    <Screen header={<StackHeader title="Quem vai jogar?" onBack={() => router.back()} />}>
      <Txt font="body400" size={14} lh={1.4} color={colors.muted}>
        Só vocês dois e um celular. Os nomes servem para o app saber de quem é a vez.
      </Txt>

      <View style={{ gap: 12 }}>
        <View style={{ gap: 6 }}>
          <Txt font="body600" size={13} color={colors.muted}>
            Primeira pessoa
          </Txt>
          <Input
            value={names[0]}
            onChangeText={(v) => coupleActions.setName(0, v)}
            placeholder="Nome"
            maxLength={16}
            autoCapitalize="words"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => segundo.current?.focus()}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Txt font="body600" size={13} color={colors.muted}>
            Segunda pessoa
          </Txt>
          <Input
            ref={segundo}
            value={names[1]}
            onChangeText={(v) => coupleActions.setName(1, v)}
            placeholder="Nome"
            maxLength={16}
            autoCapitalize="words"
            returnKeyType="done"
          />
        </View>
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 6, marginTop: 4 }}>
        <Display size={20}>Não tem resposta certa</Display>
        <Txt font="body400" size={13} lh={1.45} color={colors.muted}>
          Ninguém ganha, ninguém perde, e não há tempo para responder. Se uma pergunta virar meia hora
          de conversa, o jogo funcionou.
        </Txt>
      </View>

      <Spacer />

      <Button label={prontos ? 'Continuar' : 'Digite os dois nomes'} disabled={!prontos} onPress={() => router.push(routes.couple.settings)} />
    </Screen>
  );
}

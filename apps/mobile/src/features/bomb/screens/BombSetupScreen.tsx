import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View, type TextInput } from 'react-native';

import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Avatar, Button, Input, Screen, Spacer, StackHeader, Txt } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';

import { BOMB_RULES } from '@jogae/engine';
import { bombActions, useBombRoster } from '../bombStore';

/**
 * Quem vai jogar. Este jogo é presencial e num aparelho só, então os jogadores são apenas
 * nomes digitados aqui — ninguém precisa ter o app, conta, nem estar conectado.
 *
 * A tela é feita para cadastrar a roda inteira de uma vez: o teclado não fecha entre um nome e
 * outro, e o campo volta a ficar vazio e focado sozinho.
 */
export function BombSetupScreen() {
  const roster = useBombRoster();
  const [name, setName] = useState('');
  const campo = useRef<TextInput>(null);

  const add = () => {
    if (!name.trim()) return;
    haptics.selection();
    bombActions.addPlayer(name);
    setName('');
    campo.current?.focus();
  };

  const faltam = BOMB_RULES.minPlayers - roster.length;
  const podeSeguir = faltam <= 0;

  return (
    <Screen header={<StackHeader title="Quem vai jogar?" onBack={() => router.back()} />}>
      <Txt font="body400" size={14} lh={1.4} color={colors.muted}>
        Um celular só, passando de mão em mão. Digite o nome de cada pessoa que está na roda.
      </Txt>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Input
          // O `flex` vai na moldura: em `style` ele iria para o texto e a caixa sumiria.
          containerStyle={{ flex: 1 }}
          ref={campo}
          value={name}
          onChangeText={setName}
          placeholder="Nome"
          maxLength={16}
          autoCapitalize="words"
          returnKeyType="next"
          // Sem isto o teclado fecha a cada nome, e cadastrar cinco pessoas vira cinco toques a mais.
          blurOnSubmit={false}
          onSubmitEditing={add}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Adicionar jogador"
          disabled={!name.trim()}
          onPress={add}
          style={{
            width: 56,
            height: 56,
            borderRadius: radii.input,
            backgroundColor: name.trim() ? colors.primary : colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt size={26} color={name.trim() ? colors.text : colors.muted}>
            +
          </Txt>
        </Pressable>
      </View>

      {roster.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 28 }}>
          <Txt size={40}>💣</Txt>
          <Txt font="body600" size={15} color={colors.muted} center>
            Ninguém na roda ainda
          </Txt>
          <Txt font="body400" size={13} lh={1.4} color={colors.muted} center style={{ maxWidth: 260 }}>
            Digite o primeiro nome acima. A ordem da lista é a ordem em que a bomba vai circular.
          </Txt>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {roster.map((p, i) => (
            <View
              key={p.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radii.input, paddingVertical: 10, paddingHorizontal: 14 }}
            >
              <Avatar name={p.name} color={p.color} size={36} />
              <Txt font="body600" size={16} style={{ flex: 1 }} numberOfLines={1}>
                {p.name}
              </Txt>
              <Txt font="body400" size={12} color={colors.muted}>
                {i + 1}º
              </Txt>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${p.name}`} onPress={() => bombActions.removePlayer(p.id)} hitSlop={10}>
                <Txt size={18} color={colors.muted}>
                  ✕
                </Txt>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Spacer />

      <Button
        label={podeSeguir ? `Continuar com ${roster.length}` : `Adicione ${faltam === 1 ? 'mais uma pessoa' : `pelo menos ${faltam} pessoas`}`}
        disabled={!podeSeguir}
        onPress={() => router.push(routes.bomb.settings)}
      />
      {podeSeguir && roster.length < BOMB_RULES.recommendedPlayers && (
        <Txt font="body400" size={12} color={colors.muted} center>
          Dá para jogar, mas fica melhor com {BOMB_RULES.recommendedPlayers} ou mais.
        </Txt>
      )}
    </Screen>
  );
}

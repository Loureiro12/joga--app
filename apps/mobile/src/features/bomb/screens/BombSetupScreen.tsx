import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Avatar, Button, Display, Input, Screen, Spacer, StackHeader, Txt } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';

import { BOMB_RULES } from '@jogae/engine';
import { bombActions, useBombRoster } from '../bombStore';

/**
 * Quem vai jogar. Este jogo é presencial e num aparelho só, então os jogadores são apenas
 * nomes digitados aqui — ninguém precisa ter o app, conta, nem estar conectado.
 */
export function BombSetupScreen() {
  const roster = useBombRoster();
  const [name, setName] = useState('');

  const add = () => {
    if (!name.trim()) return;
    haptics.selection();
    bombActions.addPlayer(name);
    setName('');
  };

  const faltam = BOMB_RULES.minPlayers - roster.length;

  return (
    <Screen header={<StackHeader title="Quem vai jogar?" onBack={() => router.back()} />}>
      <Txt font="body400" size={14} lh={1.4} color={colors.muted}>
        Um celular só, passando de mão em mão. Digite o nome de cada pessoa que está na roda.
      </Txt>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Input
          style={{ flex: 1 }}
          value={name}
          onChangeText={setName}
          placeholder="Nome"
          maxLength={16}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={add}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Adicionar jogador"
          onPress={add}
          style={{ width: 56, height: 56, borderRadius: radii.input, backgroundColor: name.trim() ? colors.primary : colors.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <Txt size={26}>+</Txt>
        </Pressable>
      </View>

      <View style={{ gap: 8 }}>
        {roster.map((p, i) => (
          <View
            key={p.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radii.input, paddingVertical: 10, paddingHorizontal: 14 }}
          >
            <Avatar name={p.name} color={p.color} size={36} />
            <Txt font="body600" size={16} style={{ flex: 1 }}>
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

      {roster.length === 0 && (
        <Txt font="body400" size={13} color={colors.muted} center>
          A ordem da lista é a ordem em que a bomba vai circular.
        </Txt>
      )}

      <Spacer />

      <Button
        label={faltam > 0 ? `Faltam ${faltam}` : `Continuar com ${roster.length}`}
        disabled={faltam > 0}
        onPress={() => router.push(routes.bomb.settings)}
      />
      {roster.length > 0 && roster.length < BOMB_RULES.recommendedPlayers && faltam <= 0 && (
        <Txt font="body400" size={12} color={colors.muted} center>
          Dá para jogar, mas fica melhor com {BOMB_RULES.recommendedPlayers} ou mais.
        </Txt>
      )}
    </Screen>
  );
}

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { features } from '@/core/config/features';
import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Button, Chip, Screen, Segmented, Spacer, StackHeader, Stepper, Txt, toast } from '@/core/ui';
import { getGame } from '@/features/catalog/data/games';
import { usePremiumStore } from '@/features/premium/premiumStore';
import { services } from '@/services';

import { roomErrorMessage } from '../hooks/roomActions';
import { getIdentity } from '../hooks/useIdentity';

/** Tela 8: Criar partida. Meta do design: começar em menos de 30 s. */
export function CreateMatchScreen() {
  const { gameId } = useLocalSearchParams<{ gameId?: string }>();
  const game = getGame(gameId) ?? getGame('impostor')!;
  const isPremium = usePremiumStore((s) => s.isPremium);
  const [players, setPlayers] = useState(game.defaults.players);
  const [category, setCategory] = useState(game.defaults.category);
  const [rounds, setRounds] = useState(game.defaults.rounds);
  const [loading, setLoading] = useState(false);

  const create = async () => {
    setLoading(true);
    try {
      await services.room.createRoom({ gameId: game.id, category, totalRounds: rounds, maxPlayers: players }, getIdentity());
      router.push(routes.match.lobby);
    } catch (e) {
      toast(roomErrorMessage(e, 'Não deu para criar a sala. Tente de novo.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      gap={22}
      header={
        <StackHeader title="Criar partida" onBack={() => router.back()} />
      }
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, paddingVertical: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt font="body600" size={16}>
          Jogadores
        </Txt>
        <Stepper value={players} min={game.minPlayers} max={game.maxPlayers} onChange={setPlayers} />
      </View>

      <View>
        <Txt font="body600" size={16} style={{ marginBottom: 10 }}>
          Categoria
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {game.wordCategories.filter((c) => features.premium || !c.premium).map((c) => {
            const locked = !!c.premium && !isPremium;
            return (
              <Chip
                key={c.id}
                emoji={c.emoji}
                label={c.label}
                state={locked ? 'locked' : c.id === category ? 'selected' : 'default'}
                onPress={() => setCategory(c.id)}
              />
            );
          })}
        </View>
      </View>

      <View>
        <Txt font="body600" size={16} style={{ marginBottom: 10 }}>
          Rodadas
        </Txt>
        <Segmented
          value={rounds}
          onChange={setRounds}
          itemHeight={48}
          fontSize={24}
          font="display800"
          options={game.roundOptions.map((n) => ({ value: n, label: String(n) }))}
        />
      </View>

      <Spacer />

      <Txt font="body400" size={13} color={colors.muted} center>
        {game.name} · {category} · {rounds} rodadas · {players} jogadores
      </Txt>
      <Button label="Criar sala" loading={loading} onPress={create} />
    </Screen>
  );
}

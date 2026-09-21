import { View } from 'react-native';

import { Trophy } from '@/core/illustrations';
import { colors } from '@/core/theme';
import { Button, Display, Screen, Spacer, Txt, WaitingButton } from '@/core/ui';

import { roomActions } from '../hooks/roomActions';
import { RankingRow } from '../components/cards';
import { useMatch } from '../store/matchStore';

/** Tela 17: Placar. */
export function RankingScreen() {
  const match = useMatch();
  if (!match) return null;
  const { room, scores, isHost, player, displayName } = match;
  const last = room.roundIndex >= room.totalRounds;

  return (
    <Screen
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Trophy size={52} />
          <View>
            <Display size={40}>Placar</Display>
            <Txt size={13} color={colors.muted}>
              Depois da rodada {room.roundIndex} de {room.totalRounds}
            </Txt>
          </View>
        </View>
      }
    >
      <View style={{ gap: 8 }}>
        {scores.map((s, i) => {
          const p = player(s.playerId);
          return p ? (
            <RankingRow key={s.playerId} index={i} position={i + 1} player={p} name={displayName(s.playerId)} points={s.points} delta={s.lastDelta} />
          ) : null;
        })}
      </View>

      <Spacer />

      {isHost ? (
        <Button label={last ? 'Ver resultado final' : 'Próxima rodada'} onPress={() => roomActions.nextRound()} />
      ) : (
        <WaitingButton label="O host inicia a próxima" />
      )}
    </Screen>
  );
}

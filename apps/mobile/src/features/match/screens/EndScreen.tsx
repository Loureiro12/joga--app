import { View } from 'react-native';

import { Enter } from '@/core/animation/Enter';
import { routes } from '@/core/navigation/routes';
import { Trophy } from '@/core/illustrations';
import { colors } from '@/core/theme';
import { Button, Chip, Display, Overline, Screen, Txt, WaitingButton } from '@/core/ui';
import { formatPoints, plural } from '@/core/utils/format';
import { getGame } from '@/features/catalog/data/games';

import { leaveMatch } from '../hooks/leaveMatch';
import { roomActions } from '../hooks/roomActions';
import { useImpostorMatch } from '../store/matchStore';

/** Tela 18: Fim da partida. */
export function EndScreen() {
  const match = useImpostorMatch();
  if (!match || !match.summary) return null;
  const { room, scores, summary, isHost, displayName } = match;
  const winner = scores[0];
  const caughtCount = summary.impostorsCaught;

  return (
    <Screen bg={colors.primary} scroll={false}>
      <Overline color="rgba(250,250,250,0.8)">
        Fim da partida · {getGame(room.gameId)?.name} · {room.totalRounds} rodadas
      </Overline>

      <Enter kind="pop" duration={700} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Trophy size={120} />
        <View style={{ alignItems: 'center' }}>
          <Display size={76} center adjustsFontSizeToFit numberOfLines={1}>
            {displayName(summary.winnerId)}
          </Display>
          <Display size={32} color={colors.accent}>
            venceu!
          </Display>
        </View>
        <Txt size={15} opacity={0.85} center>
          {formatPoints(winner.points)} pts · {caughtCount} {plural(caughtCount, 'impostor descoberto', 'impostores descobertos')}
        </Txt>
      </Enter>

      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {scores.slice(1, 3).map((s, i) => (
          <Chip key={s.playerId} state="translucent" size="sm" label={`${i === 0 ? '🥈' : '🥉'} ${displayName(s.playerId)} ${formatPoints(s.points)}`} />
        ))}
      </View>

      {isHost ? (
        <Button label="Jogar novamente" variant="onColor" onPress={() => roomActions.playAgain()} />
      ) : (
        <WaitingButton label="Aguardando o host" />
      )}
      <Button label="Escolher outro jogo" variant="translucent" onPress={() => leaveMatch(routes.explore)} />
    </Screen>
  );
}

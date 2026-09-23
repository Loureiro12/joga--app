import { View } from 'react-native';

import { colors } from '@/core/theme';
import { Avatar, Display, Overline, PillButton, ProgressRing, Screen, Txt } from '@/core/ui';

import { MatchTopRow } from '../../components/MatchMenu';
import { roomActions } from '../../hooks/roomActions';
import { useLikelyMatch } from '../../store/matchStore';

/**
 * Aguardando votos. Mostra QUANTOS já votaram, nunca em quem: saber a tendência antes da hora
 * influenciaria quem ainda não votou, e é justamente isso que o jogo precisa evitar.
 */
export function LikelyWaitingScreen() {
  const match = useLikelyMatch();
  if (!match?.votes || !match.round) return null;
  const { round, votes, connectedPlayers, me, isHost } = match;
  const voted = new Set(votes.votedIds);
  const done = votes.votedIds.length >= votes.total;
  const ordered = [me, ...connectedPlayers.filter((p) => p.id !== me.id)];

  return (
    <Screen scroll={false}>
      <MatchTopRow>
        <Overline>Pergunta {round.index} · Votação</Overline>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
          <Txt font="body600" size={12} color={colors.success}>
            Seu voto está guardado
          </Txt>
        </View>
      </MatchTopRow>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 }}>
        <ProgressRing size={180} thickness={12} progress={votes.total ? votes.votedIds.length / votes.total : 0} color={colors.accent}>
          <Display size={72} tabular accessibilityLabel={`${votes.votedIds.length} de ${votes.total} votaram`}>
            {votes.votedIds.length}
            <Display size={28} color={colors.muted}>
              /{votes.total}
            </Display>
          </Display>
        </ProgressRing>

        <View>
          <Display size={40} center>
            {done ? 'Todo mundo votou 👀' : 'Aguardando votos…'}
          </Display>
          <Txt size={15} lh={1.4} color={colors.muted} center style={{ marginTop: 8 }}>
            Ninguém vê os votos até a revelação.
          </Txt>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
          {ordered.map((p) => (
            <Avatar key={p.id} name={p.name} color={p.color} size={40} style={{ opacity: voted.has(p.id) ? 1 : 0.35 }} />
          ))}
        </View>
      </View>

      {/* Saída para quando alguém trava: o host encerra e apura com o que já veio. */}
      {isHost && !done && votes.votedIds.length > 0 && (
        <PillButton label="Encerrar votação" bg={colors.surface} fg={colors.text} size={15} padY={12} onPress={roomActions.endVoting} />
      )}
    </Screen>
  );
}

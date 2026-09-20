import { View } from 'react-native';

import { colors } from '@/core/theme';
import { Avatar, Display, Overline, ProgressRing, Screen, Txt } from '@/core/ui';

import { useMatch } from '../store/matchStore';

/** Tela 15: Aguardando votos (tela cheia). Avança sozinha quando o servidor muda a fase. */
export function WaitingVotesScreen() {
  const match = useMatch();
  if (!match || !match.votes) return null;
  const { room, votes, connectedPlayers, me, displayName } = match;
  const voted = new Set(votes.votedIds);
  const done = votes.votedIds.length >= votes.total;
  const missing = votes.total - votes.votedIds.length;
  const ordered = [me, ...connectedPlayers.filter((p) => p.id !== me.id)];

  return (
    <Screen scroll={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Overline>Rodada {room.roundIndex} · Votação</Overline>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
          <Txt font="body600" size={12} color={colors.success}>
            Seu voto está guardado
          </Txt>
        </View>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 }}>
        <ProgressRing size={180} thickness={12} progress={votes.votedIds.length / votes.total} color={colors.accent}>
          <Display size={72} tabular accessibilityLabel={`${votes.votedIds.length} de ${votes.total} votaram`}>
            {votes.votedIds.length}
            <Display size={28} color={colors.muted}>
              /{votes.total}
            </Display>
          </Display>
        </ProgressRing>

        <View>
          <Display size={40} center>
            {done ? 'Todos votaram!' : 'Aguardando votos…'}
          </Display>
          <Txt size={15} lh={1.4} color={colors.muted} center style={{ marginTop: 8 }}>
            Ninguém vê os votos até todos confirmarem.
          </Txt>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
          {ordered.map((p) => (
            <View key={p.id} style={{ alignItems: 'center', gap: 6, opacity: voted.has(p.id) ? 1 : 0.4 }}>
              <Avatar name={p.name} color={p.color} size={48} checked={voted.has(p.id)} ringColor={colors.background} />
              <Txt size={11} color={colors.muted}>
                {displayName(p.id)}
              </Txt>
            </View>
          ))}
        </View>
      </View>

      <Txt font="body400" size={12} color={colors.muted} center>
        {done ? 'Revelando o resultado…' : `${missing === 1 ? 'Falta' : 'Faltam'} ${missing} — dá para trocar de ideia? Não. Voto é voto.`}
      </Txt>
    </Screen>
  );
}

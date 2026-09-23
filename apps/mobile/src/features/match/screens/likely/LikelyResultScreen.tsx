import { View } from 'react-native';

import { colors, radii } from '@/core/theme';
import { Avatar, Button, Display, Overline, Screen, Spacer, Txt } from '@/core/ui';

import { roomActions } from '../../hooks/roomActions';
import { useLikelyMatch } from '../../store/matchStore';

/**
 * A revelação é a parte que vale o jogo, então ela não entrega tudo de uma vez: o servidor
 * manda três tempos (suspense → contagem → resultado) e esta tela só desenha o que já chegou.
 * O empate é resultado, não erro: dois vencedores aparecem lado a lado, sem desempate.
 */
export function LikelyResultScreen() {
  const match = useLikelyMatch();
  if (!match?.result || !match.round) return null;
  const { result, round, isHost, player, displayName, me } = match;

  if (result.stage === 0) {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Txt size={56}>👀</Txt>
          <Display size={40} center>
            Todo mundo votou…
          </Display>
          <Txt size={16} color={colors.muted} center>
            {result.totalVotes} de {result.eligibleCount} responderam.
          </Txt>
        </View>
      </Screen>
    );
  }

  if (result.stage === 1) {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Display size={44} center>
            Preparados?
          </Display>
          <Txt font="body400" size={15} color={colors.muted} center>
            O grupo decidiu.
          </Txt>
        </View>
      </Screen>
    );
  }

  const empate = result.winnerIds.length > 1;
  const vencedores = result.winnerIds.map((id) => player(id));
  const topVotes = result.tally[0]?.votes ?? 0;
  const meuGanho = result.pointsDelta[me.id] ?? 0;

  const manchete = result.selfConfirmed
    ? { titulo: 'Nem ele conseguiu negar 💀', linha: `${vencedores[0]?.name ?? 'Ele'} também votou nele mesmo.` }
    : result.unanimous
      ? { titulo: 'Unânime 💀', linha: `${topVotes} de ${result.eligibleCount} votos na mesma pessoa.` }
      : empate
        ? { titulo: 'Deu empate 👀', linha: `${topVotes} votos cada.` }
        : { titulo: null, linha: `${topVotes} de ${result.totalVotes} pessoas escolheram.` };

  return (
    <Screen>
      <Overline>Pergunta {round.index}</Overline>
      <Txt font="body600" size={15} color={colors.accent}>
        Quem é mais provável de…
      </Txt>
      <Txt font="body400" size={15} lh={1.35} color={colors.muted}>
        {round.question}
      </Txt>

      <View style={{ alignItems: 'center', gap: 12, marginTop: 8 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {vencedores.map((p, i) => (
            <Avatar key={p?.id ?? i} name={p?.name ?? '?'} color={p?.color ?? colors.surfaceLight} size={72} />
          ))}
        </View>
        <Display size={empate ? 34 : 44} center>
          {vencedores.map((p) => p?.name ?? 'Quem saiu').join(' & ')}
        </Display>
        {manchete.titulo && (
          <Display size={20} color={colors.accent} center>
            {manchete.titulo}
          </Display>
        )}
        <Txt font="body400" size={15} color={colors.muted} center>
          {manchete.linha}
        </Txt>
      </View>

      <View style={{ gap: 8, marginTop: 4 }}>
        <Overline>Quem recebeu votos</Overline>
        {result.tally.map((entry) => {
          const p = player(entry.playerId);
          const venceu = result.winnerIds.includes(entry.playerId);
          return (
            <View
              key={entry.playerId}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: colors.surface,
                borderRadius: radii.input,
                borderWidth: venceu ? 1 : 0,
                borderColor: colors.accent,
                paddingVertical: 10,
                paddingHorizontal: 14,
              }}
            >
              <Avatar name={p?.name ?? '?'} color={p?.color ?? colors.surfaceLight} size={34} />
              <View style={{ flex: 1 }}>
                <Txt font="body600" size={15}>
                  {p?.name ?? 'Quem saiu da sala'}
                </Txt>
                {/* No modo secreto `voterIds` vem vazio e só a contagem aparece. */}
                {entry.voterIds.length > 0 && (
                  <Txt font="body400" size={12} color={colors.muted} numberOfLines={2}>
                    {entry.voterIds.map((id) => displayName(id)).join(', ')}
                  </Txt>
                )}
              </View>
              <Display font="display700" size={20} color={venceu ? colors.accent : colors.muted}>
                {entry.votes}
              </Display>
            </View>
          );
        })}
      </View>

      {meuGanho > 0 && (
        <Txt font="body600" size={14} color={colors.success} center>
          +{meuGanho} pontos: você adivinhou o grupo.
        </Txt>
      )}

      <Spacer />

      <Display size={22} center>
        Defendam seus votos 😏
      </Display>

      {isHost ? (
        <Button label="Próxima pergunta" onPress={roomActions.nextRound} />
      ) : (
        <Txt font="body600" size={14} color={colors.muted} center>
          O host avança quando vocês terminarem.
        </Txt>
      )}
    </Screen>
  );
}

import { View } from 'react-native';

import { Enter } from '@/core/animation/Enter';
import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Avatar, Button, Chip, Display, Overline, Screen, Txt, WaitingButton } from '@/core/ui';
import { formatPoints, plural } from '@/core/utils/format';

import { exitAfterMatch } from '@/features/ads/exitAfterMatch';
import { getGameByEngine } from '@/features/catalog/data/games';

import { leaveMatch } from '../../hooks/leaveMatch';
import { roomActions } from '../../hooks/roomActions';
import { useLikelyMatch } from '../../store/matchStore';

/**
 * Fim da partida. O destaque não é quem ganhou: é o que o grupo decidiu sobre cada um —
 * essa é a conversa que continua depois que o app fecha. O placar só aparece no modo competitivo.
 */
export function LikelyEndScreen() {
  const match = useLikelyMatch();
  if (!match?.summary) return null;
  const { summary, scores, isHost, displayName, player, room } = match;
  const maisEscolhido = summary.mostChosenIds.map((id) => player(id)).filter(Boolean);
  const competitivo = scores.some((s) => s.points > 0);

  return (
    <Screen bg={colors.accent}>
      <Overline color="rgba(15,15,19,0.7)">
        Fim da partida · {summary.questions} {plural(summary.questions, 'pergunta', 'perguntas')}
      </Overline>

      <Enter kind="pop" duration={700} style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
        {maisEscolhido.length > 0 ? (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {maisEscolhido.map((p, i) => (
                <Avatar key={p?.id ?? i} name={p?.name ?? '?'} color={p?.color ?? colors.surface} size={80} />
              ))}
            </View>
            <Display size={52} color={colors.background} center adjustsFontSizeToFit numberOfLines={1}>
              {maisEscolhido.map((p) => p?.name).join(' & ')}
            </Display>
            <Display size={22} color={colors.background}>
              foi quem o grupo mais apontou
            </Display>
          </>
        ) : (
          <Display size={40} color={colors.background} center>
            Fim de jogo 🎉
          </Display>
        )}
      </Enter>

      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Chip state="translucent" size="sm" label={`🗳 ${summary.votes} votos`} />
        {summary.unanimities > 0 && <Chip state="translucent" size="sm" label={`💀 ${summary.unanimities} ${plural(summary.unanimities, 'unanimidade', 'unanimidades')}`} />}
        {summary.ties > 0 && <Chip state="translucent" size="sm" label={`👀 ${summary.ties} ${plural(summary.ties, 'empate', 'empates')}`} />}
      </View>

      {summary.highlights.length > 0 && (
        <View style={{ backgroundColor: colors.background, borderRadius: radii.card, padding: 18, gap: 14 }}>
          <Overline>O grupo decidiu que…</Overline>
          {summary.highlights.map((h) => (
            <View key={h.questionId} style={{ gap: 2 }}>
              <Txt font="body600" size={16}>
                {h.winnerIds.map((id) => displayName(id)).join(' & ')}
              </Txt>
              <Txt font="body400" size={13} lh={1.35} color={colors.muted}>
                é mais provável de {h.question.replace(/\?$/, '')} · {h.votes} {plural(h.votes, 'voto', 'votos')}
              </Txt>
            </View>
          ))}
        </View>
      )}

      {competitivo && (
        <View style={{ backgroundColor: colors.background, borderRadius: radii.card, padding: 18, gap: 10 }}>
          <Overline>Quem leu melhor o grupo</Overline>
          {scores.slice(0, 5).map((s) => {
            // Colocação pelos pontos, não pela linha: quem empata recebe a mesma medalha.
            const posicao = 1 + scores.filter((o) => o.points > s.points).length;
            return (
            <View key={s.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt font="body600" size={14} color={colors.muted}>
                {['🥇', '🥈', '🥉'][posicao - 1] ?? `${posicao}º`}
              </Txt>
              <Txt font="body600" size={15} style={{ flex: 1 }}>
                {displayName(s.playerId)}
              </Txt>
              <Display font="display700" size={18}>
                {formatPoints(s.points)}
              </Display>
            </View>
            );
          })}
        </View>
      )}

      {isHost ? <Button label="Jogar novamente" variant="onColor" onPress={() => roomActions.playAgain()} /> : <WaitingButton label="Aguardando o host" />}
      <Button label="Escolher outro jogo" variant="translucent" onPress={() => exitAfterMatch(getGameByEngine(room.gameId)?.id, () => leaveMatch(routes.explore))} />
    </Screen>
  );
}

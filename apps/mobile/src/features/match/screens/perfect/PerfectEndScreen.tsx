import { View } from 'react-native';

import { Enter } from '@/core/animation/Enter';
import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Button, Display, Overline, Screen, Txt, WaitingButton } from '@/core/ui';
import { formatPoints, plural } from '@/core/utils/format';

import { exitAfterMatch } from '@/features/ads/exitAfterMatch';
import { getGameByEngine } from '@/features/catalog/data/games';

import { leaveMatch } from '../../hooks/leaveMatch';
import { roomActions } from '../../hooks/roomActions';
import { usePerfectMatch } from '../../store/matchStore';

/**
 * O fim. O título é do casal com mais respostas iguais **nesta partida** — e o texto tem de
 * deixar isso claro (§52). Nada aqui é porcentagem de compatibilidade, nota de relacionamento
 * ou veredito sobre quem se conhece de verdade: é um jogo de festa, não um laudo.
 */
export function PerfectEndScreen() {
  const match = usePerfectMatch();
  if (!match?.summary) return null;
  const { summary, couples, myCoupleId, isHost, displayName, room } = match;
  const { standings, titles, mine } = summary;

  const campeao = standings[0];
  const casalCampeao = couples.find((c) => c.id === campeao?.coupleId);
  const nomeDoCasal = (id: string) => {
    const c = couples.find((x) => x.id === id);
    return c ? `${c.emoji} ${displayName(c.aId)} & ${displayName(c.bId)}` : '—';
  };

  return (
    <Screen>
      <Overline color={colors.primary}>🏆 Casal perfeito</Overline>

      <Enter kind="pop" duration={700} style={{ alignItems: 'center', gap: 6, paddingVertical: 4 }}>
        <Txt size={40}>{casalCampeao?.emoji ?? '💞'}</Txt>
        <Display size={40} center adjustsFontSizeToFit numberOfLines={2}>
          {casalCampeao ? `${displayName(casalCampeao.aId)} & ${displayName(casalCampeao.bId)}` : 'Fim de jogo'}
        </Display>
        {campeao && (
          <Txt font="body600" size={16} color={colors.accent}>
            {formatPoints(campeao.points)} pontos · {campeao.matches} de {campeao.rounds} matches
          </Txt>
        )}
      </Enter>

      <Txt font="body400" size={12} lh={1.4} color={colors.muted} center>
        {summary.percent}% das respostas da mesa coincidiram nesta partida. É estatística da noite, não medida de relacionamento.
      </Txt>

      {standings.length > 1 && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 10 }}>
          <Overline>Como terminou</Overline>
          {standings.map((linha, i) => (
            <View key={linha.coupleId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt font="body600" size={14} color={colors.muted}>
                {['🥇', '🥈', '🥉'][i] ?? `${i + 1}º`}
              </Txt>
              <View style={{ flex: 1 }}>
                <Txt font="body600" size={15}>
                  {nomeDoCasal(linha.coupleId)}
                </Txt>
                <Txt font="body400" size={12} color={colors.muted}>
                  {linha.matches}/{linha.rounds} matches
                </Txt>
              </View>
              <Display font="display700" size={18}>
                {formatPoints(linha.points)}
              </Display>
            </View>
          ))}
        </View>
      )}

      {titles.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {titles.map((t) => (
            <View key={t.key} style={{ flexGrow: 1, flexBasis: '46%', backgroundColor: colors.surface, borderRadius: radii.card, padding: 14, gap: 2 }}>
              <Txt size={22}>{t.emoji}</Txt>
              <Txt font="body600" size={14}>
                {t.title}
              </Txt>
              <Txt font="body600" size={13} color={colors.accent}>
                {t.coupleId ? nomeDoCasal(t.coupleId) : displayName(t.playerId!)}
              </Txt>
              <Txt font="body400" size={11} lh={1.3} color={colors.muted}>
                {t.detail}
              </Txt>
            </View>
          ))}
        </View>
      )}

      {mine && mine.rounds > 0 && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 12 }}>
          <Overline>Vocês dois</Overline>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Numero valor={`${mine.matches}/${mine.rounds}`} rotulo="matches" />
            <Numero valor={`🔥 ${mine.bestStreak}`} rotulo="maior sequência" />
            {mine.bestCategory && <Numero valor={`${mine.bestCategory.matches}/${mine.bestCategory.rounds}`} rotulo={mine.bestCategory.category} />}
          </View>

          {mine.reads.some((r) => r.tries > 0) && (
            <View style={{ gap: 2 }}>
              {mine.reads
                .filter((r) => r.tries > 0)
                .map((r) => (
                  <Txt key={r.playerId} font="body400" size={13} color={colors.muted}>
                    {displayName(r.playerId)} acertou {r.hits} de {r.tries} sobre o par
                  </Txt>
                ))}
            </View>
          )}

          {mine.agreed.length > 0 && (
            <View style={{ gap: 4 }}>
              <Txt font="body600" size={14}>
                💚 Vocês combinaram em
              </Txt>
              {mine.agreed.slice(0, 4).map((texto) => (
                <Txt key={texto} font="body400" size={12} lh={1.35} color={colors.muted}>
                  · {texto}
                </Txt>
              ))}
            </View>
          )}

          {mine.disagreed.length > 0 && (
            <View style={{ gap: 4 }}>
              <Txt font="body600" size={14}>
                😂 E discordaram em
              </Txt>
              {mine.disagreed.slice(0, 4).map((texto) => (
                <Txt key={texto} font="body400" size={12} lh={1.35} color={colors.muted}>
                  · {texto}
                </Txt>
              ))}
            </View>
          )}
        </View>
      )}

      {myCoupleId === null && (
        <Txt font="body400" size={12} color={colors.muted} center>
          Você ficou sem dupla nesta partida — na próxima, escolha um par no começo.
        </Txt>
      )}

      {isHost ? <Button label="Jogar de novo" onPress={() => roomActions.playAgain()} /> : <WaitingButton label="Aguardando o host" />}
      <Button label="Escolher outro jogo" variant="tertiary" onPress={() => exitAfterMatch(getGameByEngine(room.gameId)?.id, () => leaveMatch(routes.explore))} />
    </Screen>
  );
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceLight, borderRadius: radii.input, paddingVertical: 12, paddingHorizontal: 10, gap: 2 }}>
      <Display font="display700" size={20}>
        {valor}
      </Display>
      <Txt font="body400" size={11} lh={1.25} color={colors.muted}>
        {rotulo}
      </Txt>
    </View>
  );
}

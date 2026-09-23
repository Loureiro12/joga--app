import { View } from 'react-native';

import { Enter } from '@/core/animation/Enter';
import { colors, radii } from '@/core/theme';
import { Button, Display, Overline, Screen, Spacer, Txt, WaitingButton } from '@/core/ui';
import { formatPoints } from '@/core/utils/format';

import type { PerfectCouple, PerfectCoupleReveal, PerfectOutcome } from '@jogae/engine';
import { MatchTopRow } from '../../components/MatchMenu';
import { roomActions } from '../../hooks/roomActions';
import { usePerfectMatch } from '../../store/matchStore';

const SELO: Record<PerfectOutcome, { emoji: string; texto: string; cor: string }> = {
  match: { emoji: '💚', texto: 'MATCH!', cor: colors.success },
  close: { emoji: '🟡', texto: 'QUASE!', cor: colors.accent },
  miss: { emoji: '💔', texto: 'não deu match', cor: colors.muted },
};

/** Frases para o não-match. Ele não é fracasso: quase sempre é a parte mais engraçada (§73). */
const CUTUCADAS = ['Essa vai render conversa 😂', 'Cada um no seu mundo 🌍', 'Alguém tem explicação? 👀', 'Vale a discussão no caminho de casa 🚗'];

/**
 * A revelação. A tela chega antes das respostas de propósito: o tempo 0 é só a pergunta e a
 * expectativa, e é ela que faz o jogo (§74). O servidor é quem manda nos tempos — todos os
 * celulares viram a mesma coisa na mesma hora.
 */
export function MatchRevealScreen() {
  const match = usePerfectMatch();
  if (!match?.result || !match.round) return null;
  const { result, round, couples, myCoupleId, isHost, displayName } = match;

  const meu = result.couples.find((c) => c.coupleId === myCoupleId);
  const ultima = !round.totalRounds ? false : round.index >= round.totalRounds;

  return (
    <Screen>
      <MatchTopRow>
        <Overline color={colors.primary}>{round.tieBreak ? '👀 Desempate' : 'Será que deu match?'}</Overline>
        <Txt font="body600" size={12} color={colors.muted}>
          {round.points} pts
        </Txt>
      </MatchTopRow>

      <Txt font="body600" size={15} lh={1.35} color={colors.muted}>
        {round.prompt}
      </Txt>

      {result.stage === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Enter kind="pop" duration={600} style={{ alignItems: 'center', gap: 10 }}>
            <Txt size={54}>👀</Txt>
            <Display size={34} center>
              Será que deu match?
            </Display>
          </Enter>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {result.couples.map((linha, i) => (
            <CartaoDoCasal
              key={linha.coupleId}
              linha={linha}
              casal={couples.find((c) => c.id === linha.coupleId)}
              meu={linha.coupleId === myCoupleId}
              nome={displayName}
              indice={i}
            />
          ))}
        </View>
      )}

      {result.stage === 2 && meu && meu.outcome === 'miss' && (
        <Txt font="body400" size={13} lh={1.4} color={colors.muted} center>
          {CUTUCADAS[round.index % CUTUCADAS.length]}
        </Txt>
      )}

      {result.standings && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 10 }}>
          <Overline>🏆 Placar</Overline>
          {result.standings.map((linha, i) => {
            const casal = couples.find((c) => c.id === linha.coupleId);
            return (
              <View key={linha.coupleId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Txt font="body600" size={14} color={colors.muted}>
                  {['🥇', '🥈', '🥉'][i] ?? `${i + 1}º`}
                </Txt>
                <Txt font="body600" size={15} style={{ flex: 1 }}>
                  {casal ? `${casal.emoji} ${displayName(casal.aId)} & ${displayName(casal.bId)}` : '—'}
                </Txt>
                <Display font="display700" size={18}>
                  {formatPoints(linha.points)}
                </Display>
              </View>
            );
          })}
        </View>
      )}

      <Spacer min={8} />

      {isHost ? (
        <Button
          label={round.tieBreak ? 'Ver o resultado' : ultima ? 'Encerrar e ver o resultado' : 'Próxima pergunta'}
          disabled={result.stage !== 2}
          onPress={roomActions.nextRound}
        />
      ) : (
        <WaitingButton label="Aguardando o host" />
      )}
    </Screen>
  );
}

function CartaoDoCasal({
  linha,
  casal,
  meu,
  nome,
  indice,
}: {
  linha: PerfectCoupleReveal;
  casal: PerfectCouple | undefined;
  meu: boolean;
  nome: (id: string) => string;
  indice: number;
}) {
  const selo = SELO[linha.outcome];
  return (
    <Enter kind="in" duration={320 + indice * 120}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radii.card,
          borderWidth: meu ? 2 : 0,
          borderColor: colors.primary,
          padding: 16,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Txt size={18}>{casal?.emoji ?? '💞'}</Txt>
          <Txt font="body600" size={15} style={{ flex: 1 }}>
            {casal ? `${nome(casal.aId)} & ${nome(casal.bId)}` : '—'}
          </Txt>
          {linha.streak >= 2 && (
            <Txt font="body600" size={12} color={colors.accent}>
              🔥 x{linha.streak}
            </Txt>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {linha.answers.map((a) => (
            <View key={a.playerId} style={{ flex: 1, backgroundColor: colors.surfaceLight, borderRadius: radii.input, paddingVertical: 10, paddingHorizontal: 12, gap: 2 }}>
              <Txt font="body400" size={11} color={colors.muted}>
                {nome(a.playerId)}
              </Txt>
              <Txt font="body600" size={15} lh={1.25} color={a.missing ? colors.muted : colors.text}>
                {/* Quando a resposta é uma pessoa, cada celular a chama do jeito certo: "Você" ou o nome. */}
                {a.missing ? 'não respondeu' : a.chosenId ? nome(a.chosenId) : a.label}
              </Txt>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Display size={18} color={selo.cor}>
            {selo.emoji} {selo.texto}
          </Display>
          <Txt font="body600" size={15} color={linha.points > 0 ? colors.success : colors.muted}>
            +{linha.points}
          </Txt>
        </View>
      </View>
    </Enter>
  );
}

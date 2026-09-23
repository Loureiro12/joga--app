import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Enter } from '@/core/animation/Enter';
import { colors, radii } from '@/core/theme';
import { Button, Display, Overline, PressableScale, Screen, Spacer, Txt } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';
import { plural } from '@/core/utils/format';

import type { PerfectOption } from '@jogae/engine';
import { MatchTopRow } from '../../components/MatchMenu';
import { roomActions } from '../../hooks/roomActions';
import { usePerfectMatch } from '../../store/matchStore';

/**
 * A pergunta da rodada, e a parte mais importante do jogo: **o que você marcou não sai daqui**
 * até todo mundo responder (§32). A tela não mostra quantos foram em cada opção nem dá qualquer
 * pista de tendência — saber isso destruiria a espera, que é o coração do jogo (§74).
 */
export function AnswerScreen() {
  const match = usePerfectMatch();
  const [escolha, setEscolha] = useState<string | null>(null);
  const round = match?.round;
  const questionId = round?.questionId;

  // Pergunta nova (ou pulada): a escolha antiga não pode continuar marcada na tela.
  useEffect(() => setEscolha(null), [questionId]);

  if (!match || !round) return null;
  const { myAnswer, votes, isHost, player } = match;
  const enviada = myAnswer !== null;
  const faltam = Math.max(0, (votes?.total ?? 0) - (votes?.votedIds.length ?? 0));

  const sobreOPar = round.type === 'know' && round.aboutId !== null && round.aboutId !== match.me.id;
  const alvo = round.aboutId ? (player(round.aboutId)?.name ?? 'seu par') : '';

  return (
    <Screen>
      <MatchTopRow>
        <Overline>
          {round.tieBreak ? 'Desempate' : round.totalRounds ? `Pergunta ${round.index} de ${round.totalRounds}` : `Pergunta ${round.index}`}
        </Overline>
        <Txt font="body600" size={12} color={colors.muted}>
          {round.category}
        </Txt>
      </MatchTopRow>

      {(round.final || round.double || round.tieBreak) && (
        <View style={{ alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: radii.pill, paddingVertical: 6, paddingHorizontal: 14 }}>
          <Txt font="body600" size={12} ls={0.6} upper color={colors.background}>
            {round.tieBreak ? '👀 Desempate' : round.final ? `💞 Match final · ${round.points} pontos` : `⭐ Rodada em dobro · ${round.points}`}
          </Txt>
        </View>
      )}

      {round.timer && !enviada && <Cronometro key={round.questionId} segundos={round.timer.remainingSec} total={round.timer.durationSec} />}

      {sobreOPar && (
        <Txt font="body600" size={13} color={colors.primary}>
          🧠 Tente prever {alvo}
        </Txt>
      )}
      {round.type === 'know' && !sobreOPar && (
        <Txt font="body600" size={13} color={colors.primary}>
          👤 Essa é sobre você — {alvo ? `${alvo} vai tentar adivinhar` : 'seu par vai tentar adivinhar'}
        </Txt>
      )}

      <Display size={32} lh={1.15}>
        {round.prompt}
      </Display>

      {enviada ? (
        <Enviada faltam={faltam} />
      ) : (
        <>
          {round.scale && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt font="body400" size={12} color={colors.muted}>
                1 · {round.scale.low}
              </Txt>
              <Txt font="body400" size={12} color={colors.muted}>
                5 · {round.scale.high}
              </Txt>
            </View>
          )}

          <View accessibilityRole="radiogroup" style={round.scale ? { flexDirection: 'row', gap: 8 } : { gap: 10 }}>
            {round.options.map((o) => (
              <Opcao
                key={o.id}
                option={o}
                escala={!!round.scale}
                selecionada={escolha === o.id}
                onPress={() => {
                  haptics.selection();
                  setEscolha(o.id);
                }}
              />
            ))}
          </View>
        </>
      )}

      <Spacer min={8} />

      {!enviada && (
        <>
          <Button label={escolha ? 'Confirmar resposta' : 'Escolha uma opção'} disabled={!escolha} onPress={() => escolha && roomActions.submitAnswer(escolha)} />
          <Txt font="body400" size={12} lh={1.35} color={colors.muted} center>
            Depois de confirmar não dá para mudar. E não vale combinar 👀
          </Txt>
        </>
      )}

      {isHost && !enviada && (votes?.votedIds.length ?? 0) === 0 && (
        <Button label="Trocar a pergunta" variant="tertiary" height={46} radius={14} fontSize={15} onPress={roomActions.skipQuestion} />
      )}
    </Screen>
  );
}

/** Depois de responder, a tela vira um aviso: o celular na mão do outro entrega tudo (§69). */
function Enviada({ faltam }: { faltam: number }) {
  return (
    <Enter kind="pop" duration={500} style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 22, gap: 8, alignItems: 'center' }}>
      <Txt size={34}>🔒</Txt>
      <Display size={24} center>
        Resposta enviada
      </Display>
      <Txt font="body600" size={14} color={colors.accent} center>
        Não entregue sua resposta 👀
      </Txt>
      <Txt font="body400" size={13} lh={1.35} color={colors.muted} center>
        {faltam > 0 ? `Faltam ${faltam} ${plural(faltam, 'pessoa', 'pessoas')} responder.` : 'Todo mundo respondeu. Preparem-se…'}
      </Txt>
    </Enter>
  );
}

function Opcao({ option, escala, selecionada, onPress }: { option: PerfectOption; escala: boolean; selecionada: boolean; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ selected: selecionada }}
      accessibilityLabel={option.label}
      pressedScale={0.98}
      onPress={onPress}
      style={{
        flex: escala ? 1 : undefined,
        flexDirection: escala ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: escala ? 0 : 12,
        backgroundColor: selecionada ? colors.primary : colors.surface,
        borderRadius: escala ? radii.input : radii.card,
        paddingVertical: escala ? 18 : 16,
        paddingHorizontal: escala ? 0 : 18,
      }}
    >
      {!!option.emoji && <Txt size={22}>{option.emoji}</Txt>}
      <Display size={escala ? 24 : 18} lh={1.2} style={escala ? undefined : { flex: 1 }}>
        {option.label}
      </Display>
    </PressableScale>
  );
}

/** Conta sozinho a partir do que veio no snapshot: o servidor não manda um por segundo. */
function Cronometro({ segundos, total }: { segundos: number; total: number }) {
  const [restante, setRestante] = useState(segundos);
  const avisou = useRef(false);

  useEffect(() => {
    setRestante(segundos);
    const t = setInterval(() => setRestante((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [segundos]);

  useEffect(() => {
    if (restante <= 5 && restante > 0 && !avisou.current) {
      avisou.current = true;
      haptics.light();
    }
  }, [restante]);

  const cor = restante <= 5 ? colors.danger : restante <= 10 ? colors.accent : colors.primary;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt font="body600" size={12} color={colors.muted}>
          Tempo
        </Txt>
        <Txt font="body600" size={14} color={cor}>
          {restante}s
        </Txt>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surfaceLight, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round((restante / Math.max(1, total)) * 100)}%`, height: 4, backgroundColor: cor }} />
      </View>
    </View>
  );
}

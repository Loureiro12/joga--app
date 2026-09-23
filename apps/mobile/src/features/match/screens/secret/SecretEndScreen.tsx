import { View } from 'react-native';

import { Enter } from '@/core/animation/Enter';
import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Button, Display, Overline, Screen, Txt, WaitingButton } from '@/core/ui';
import { formatPoints, plural } from '@/core/utils/format';

import { leaveMatch } from '../../hooks/leaveMatch';
import { roomActions } from '../../hooks/roomActions';
import { useSecretMatch } from '../../store/matchStore';

const LINHA: Record<string, { emoji: string; texto: string; cor: string }> = {
  validada: { emoji: '✅', texto: 'Cumpriu sem ninguém perceber', cor: colors.success },
  pego: { emoji: '🚨', texto: 'Foi pego', cor: colors.danger },
  rejeitada: { emoji: '🤨', texto: 'O grupo não comprou a história', cor: colors.muted },
  concluida: { emoji: '✅', texto: 'Cumpriu', cor: colors.success },
  ativa: { emoji: '😶', texto: 'Não cumpriu', cor: colors.muted },
};

/**
 * Fim da noite. O que o grupo quer ver aqui é o quadro geral — quem passou a noite inteira
 * fazendo algo estranho debaixo do nariz de todos. O placar só aparece no modo competitivo.
 */
export function SecretEndScreen() {
  const match = useSecretMatch();
  if (!match?.summary) return null;
  const { summary, competitive, isHost, displayName } = match;
  const cumpriram = summary.players.filter((p) => p.status === 'validada').length;
  const pegos = summary.players.filter((p) => p.status === 'pego').length;

  return (
    <Screen>
      <Overline color={colors.accent}>🕵️ Fim da noite</Overline>

      <Enter kind="pop" duration={600} style={{ alignItems: 'center', gap: 6, paddingVertical: 4 }}>
        <Display size={44} center>
          {cumpriram === 0 ? 'Ninguém escapou 👀' : `${cumpriram} de ${summary.players.length}`}
        </Display>
        <Txt font="body400" size={15} lh={1.35} color={colors.muted} center>
          {cumpriram === 0
            ? 'Nenhuma missão passou batida.'
            : `${plural(cumpriram, 'conseguiu', 'conseguiram')} cumprir a missão sem ninguém perceber${pegos > 0 ? ` · ${pegos} ${plural(pegos, 'caiu', 'caíram')}` : ''}.`}
        </Txt>
      </Enter>

      {summary.highlights.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {summary.highlights.map((h) => (
            <View key={h.key} style={{ flexGrow: 1, flexBasis: '46%', backgroundColor: colors.surface, borderRadius: radii.card, padding: 14, gap: 2 }}>
              <Txt size={22}>{h.emoji}</Txt>
              <Txt font="body600" size={14}>
                {h.title}
              </Txt>
              <Txt font="body600" size={13} color={colors.accent}>
                {displayName(h.playerId)}
              </Txt>
              <Txt font="body400" size={11} lh={1.3} color={colors.muted}>
                {h.value}
              </Txt>
            </View>
          ))}
        </View>
      )}

      <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 12 }}>
        <Overline>{competitive ? 'Placar' : 'Como cada um se saiu'}</Overline>
        {summary.players.map((p) => {
          const linha = LINHA[p.status] ?? LINHA.ativa;
          return (
            <View key={p.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt size={17}>{linha.emoji}</Txt>
              <View style={{ flex: 1, gap: 1 }}>
                <Txt font="body600" size={15}>
                  {displayName(p.playerId)}
                </Txt>
                <Txt font="body400" size={12} color={linha.cor}>
                  {p.status === 'pego' && p.caughtBy ? `Pego por ${displayName(p.caughtBy)}` : linha.texto}
                </Txt>
              </View>
              {competitive && (
                <Display font="display700" size={18}>
                  {formatPoints(p.points)}
                </Display>
              )}
            </View>
          );
        })}
      </View>

      {isHost ? <Button label="Nova rodada de missões" onPress={() => roomActions.playAgain()} /> : <WaitingButton label="Aguardando o host" />}
      <Button label="Escolher outro jogo" variant="tertiary" onPress={() => leaveMatch(routes.explore)} />
    </Screen>
  );
}

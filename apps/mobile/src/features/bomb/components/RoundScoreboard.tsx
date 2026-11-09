import { ScrollView, View } from 'react-native';

import { colors, radii } from '@/core/theme';
import { Display, Overline, Txt } from '@/core/ui';

import type { BombMode, BombStanding } from '@jogae/engine';

/**
 * O placar entre uma rodada e a outra.
 *
 * Fica na tela da explosão (e na do desarme), porque é ali que o grupo para e conversa — e a
 * pergunta que todo mundo faz nesse instante é "como é que tá?". Sem isso, a resposta só vem no
 * fim da partida, quando já não dá para fazer nada a respeito.
 *
 * Vai sobre fundo colorido (vermelho da explosão, verde do desarme), então usa véu escuro em vez
 * de superfície: a cor da tela é parte do susto e não pode ser coberta por um cartão cinza.
 */
export function RoundScoreboard({
  standings,
  mode,
  name,
  highlightId,
  compact = false,
}: {
  standings: BombStanding[];
  mode: BombMode;
  name: (id: string) => string;
  /** Quem acabou de levar a bomba: a linha dele ganha destaque. */
  highlightId?: string | null;
  /** Em sala a tela tem menos espaço livre; mostra menos linhas antes de rolar. */
  compact?: boolean;
}) {
  if (standings.length < 2) return null;
  const porPontos = mode === 'pontos';

  return (
    <View style={{ backgroundColor: colors.overlayDarker, borderRadius: radii.card, paddingVertical: 12, paddingHorizontal: 14, gap: 8 }}>
      <Overline color="rgba(250,250,250,0.75)">{porPontos ? 'Placar' : 'Bombas até agora'}</Overline>
      {/* Rola em vez de empurrar o botão para fora: a mesa pode ter dezesseis pessoas. */}
      <ScrollView style={{ maxHeight: compact ? 136 : 196 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 6 }}>
          {standings.map((linha) => {
            const destaque = highlightId != null && linha.playerId === highlightId;
            return (
              <View
                key={linha.playerId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  opacity: linha.eliminated ? 0.55 : 1,
                  backgroundColor: destaque ? colors.overlayDark : 'transparent',
                  borderRadius: radii.input,
                  paddingVertical: 3,
                  paddingHorizontal: destaque ? 8 : 0,
                  marginHorizontal: destaque ? -8 : 0,
                }}
              >
                <Txt font="body700" size={13} style={{ width: 26, opacity: 0.75 }}>
                  {['🥇', '🥈', '🥉'][linha.position - 1] ?? `${linha.position}º`}
                </Txt>
                <Txt font="body600" size={15} style={{ flex: 1 }} numberOfLines={1}>
                  {name(linha.playerId)}
                  {linha.eliminated ? ' 💀' : ''}
                </Txt>
                <Display font="display700" size={17}>
                  {porPontos ? linha.points : (linha.bombs || '—')}
                </Display>
                {!porPontos && linha.bombs > 0 && (
                  <Txt size={13} style={{ opacity: 0.8 }}>
                    💣
                  </Txt>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

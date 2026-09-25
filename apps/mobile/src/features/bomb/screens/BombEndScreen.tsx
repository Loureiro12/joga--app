import { View } from 'react-native';

import { Enter } from '@/core/animation/Enter';
import { colors, radii } from '@/core/theme';
import { Avatar, Button, Display, Overline, Screen, Txt } from '@/core/ui';
import { plural } from '@/core/utils/format';

import { highlights, standings } from '@jogae/engine';
import { exitLocalMatch } from '@/features/ads/exitAfterMatch';

import { bombActions, useBombMatch } from '../bombStore';

/**
 * Fim da partida. O que fica da noite não é o placar: são os apelidos que o grupo ganhou.
 * Por isso os destaques vêm antes da tabela.
 */
export function BombEndScreen() {
  const match = useBombMatch();
  if (!match) return null;

  const tabela = standings(match);
  const destaques = highlights(match);
  const nome = (id: string) => match.players.find((p) => p.id === id)?.name ?? '—';
  const cor = (id: string) => match.players.find((p) => p.id === id)?.color ?? colors.surface;
  const campeao = tabela[0];
  const eliminacao = match.settings.mode === 'eliminacao';
  const pontos = match.settings.mode === 'pontos';

  return (
    <Screen bg={colors.danger}>
      <Overline color="rgba(250,250,250,0.8)">
        Fim de jogo · {match.history.length} {plural(match.history.length, 'rodada', 'rodadas')}
      </Overline>

      <Enter kind="pop" duration={700} style={{ alignItems: 'center', gap: 10, paddingVertical: 4 }}>
        <Avatar name={nome(campeao.playerId)} color={cor(campeao.playerId)} size={84} />
        <Display size={52} center adjustsFontSizeToFit numberOfLines={1}>
          {nome(campeao.playerId)}
        </Display>
        <Display size={22}>{eliminacao ? '👑 último sobrevivente' : pontos ? '🏆 mais pontos' : '🧊 menos bombas'}</Display>
      </Enter>

      {destaques.length > 0 && (
        <View style={{ backgroundColor: colors.background, borderRadius: radii.card, padding: 18, gap: 14 }}>
          <Overline>Destaques da noite</Overline>
          {destaques.map((h) => (
            <View key={h.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Txt size={24}>{h.emoji}</Txt>
              <View style={{ flex: 1 }}>
                <Txt font="body600" size={15}>
                  {h.title} · {nome(h.playerId)}
                </Txt>
                <Txt font="body400" size={12} color={colors.muted}>
                  {h.value}
                </Txt>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ backgroundColor: colors.background, borderRadius: radii.card, padding: 18, gap: 10 }}>
        <Overline>{pontos ? 'Pontos' : 'Bombas recebidas'}</Overline>
        {tabela.map((linha) => (
          <View key={linha.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Txt font="body600" size={14} color={colors.muted} style={{ width: 28 }}>
              {['🥇', '🥈', '🥉'][linha.position - 1] ?? `${linha.position}º`}
            </Txt>
            <Avatar name={nome(linha.playerId)} color={cor(linha.playerId)} size={28} />
            <Txt font="body600" size={15} style={{ flex: 1 }} numberOfLines={1}>
              {nome(linha.playerId)}
              {linha.eliminated ? ' 💀' : ''}
            </Txt>
            <Display font="display700" size={18}>
              {pontos ? linha.points : '💣'.repeat(Math.min(linha.bombs, 3)) || '—'}
            </Display>
            {!pontos && linha.bombs > 3 && (
              <Txt font="body600" size={13} color={colors.muted}>
                ×{linha.bombs}
              </Txt>
            )}
          </View>
        ))}
      </View>

      {match.history.length > 0 && (
        <View style={{ backgroundColor: colors.background, borderRadius: radii.card, padding: 18, gap: 10 }}>
          <Overline>Como foi o caos</Overline>
          {match.history.map((r) => (
            <View key={r.round} style={{ gap: 1 }}>
              <Txt font="body400" size={13} color={colors.muted} numberOfLines={1}>
                {r.challenge}
              </Txt>
              <Txt font="body600" size={14}>
                💥 {nome(r.loserId)}
              </Txt>
            </View>
          ))}
        </View>
      )}

      <Button label="Jogar de novo" variant="onColor" onPress={() => bombActions.playAgain(match.settings)} />
      <Button
        label="Escolher outro jogo"
        variant="translucent"
        onPress={() => exitLocalMatch(match.settings.variant === 'alfabeto' ? 'bomba-alfabeto' : 'bomba-relogio', bombActions.leave)}
      />
    </Screen>
  );
}

import { router } from 'expo-router';
import { View } from 'react-native';

import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Avatar, Button, Display, Overline, Screen, Txt } from '@/core/ui';

import { roomActions } from '../../hooks/roomActions';
import { useWhoamiMatch } from '../../store/matchStore';

/**
 * O placar final do "Quem Sou Eu?" (§27).
 *
 * Os títulos não são enfeite: a maioria dos grupos termina a partida discutindo quem foi o
 * chutador, e isso rende mais conversa que a primeira posição. O que o app NÃO dá é o título de
 * "melhores perguntas" da spec — as perguntas são faladas, ele não as vê. No lugar entra
 * "Detetive", que mede quem descobriu sem pedir dica: é o mais próximo que ele sabe medir, e
 * chamar de outra coisa seria inventar um número.
 */
export function WhoamiEndScreen() {
  const match = useWhoamiMatch();
  if (!match?.summary) return null;
  const { summary, isHost, displayName, player, me } = match;
  const { standings, titles, rounds } = summary;

  const campeao = standings[0];
  const MEDALHA = ['🥇', '🥈', '🥉'];

  return (
    <Screen>
      <Overline>
        {rounds} rodada{rounds > 1 ? 's' : ''}
      </Overline>
      <Display size={42}>Placar final</Display>
      {campeao ? (
        <Txt font="body400" size={15} color={colors.muted}>
          {campeao.playerId === me.id ? 'Você levou' : `${displayName(campeao.playerId)} levou`} com {campeao.points} pontos.
        </Txt>
      ) : null}

      <View style={{ gap: 8 }}>
        {standings.map((linha, i) => (
          <View
            key={linha.playerId}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              borderRadius: radii.list,
              backgroundColor: linha.playerId === me.id ? colors.surfaceLight : colors.surface,
            }}
          >
            <Txt font="body600" size={16} style={{ width: 28 }}>
              {MEDALHA[i] ?? `${linha.position}º`}
            </Txt>
            <Avatar name={player(linha.playerId)?.name ?? '?'} color={player(linha.playerId)?.color ?? colors.primary} size={30} />
            <View style={{ flex: 1 }}>
              <Txt font="body600" size={16}>
                {displayName(linha.playerId)}
              </Txt>
              <Txt font="body400" size={13} color={colors.muted}>
                {linha.found} descoberta{linha.found === 1 ? '' : 's'}
                {linha.misses > 0 ? ` · ${linha.misses} erro${linha.misses > 1 ? 's' : ''}` : ''}
              </Txt>
            </View>
            <Txt font="body600" size={18} color={linha.points >= 0 ? colors.text : colors.danger}>
              {linha.points}
            </Txt>
          </View>
        ))}
      </View>

      {titles.length ? (
        <>
          <Txt font="body600" size={14} color={colors.muted} style={{ marginBottom: 10 }}>
            TÍTULOS DA NOITE
          </Txt>
          <View style={{ gap: 8 }}>
            {titles.map((t) => (
              <View key={t.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.list, backgroundColor: colors.surface }}>
                <Txt size={26}>{t.emoji}</Txt>
                <View style={{ flex: 1 }}>
                  <Txt font="body600" size={15}>
                    {t.title}
                  </Txt>
                  <Txt font="body400" size={13} color={colors.muted}>
                    {displayName(t.playerId)} · {t.value}
                  </Txt>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {isHost ? <Button label="Jogar de novo" onPress={roomActions.playAgain} /> : null}
      <Button label="Sair da sala" variant="translucent" onPress={() => router.replace(routes.home)} />
    </Screen>
  );
}

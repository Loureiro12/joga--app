import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Enter } from '@/core/animation/Enter';
import { Dots } from '@/core/animation/loops';
import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Avatar, Button, Display, Overline, Spacer, Txt, useScreenPadding } from '@/core/ui';
import { plural } from '@/core/utils/format';
import { haptics } from '@/core/utils/haptics';

import { VoteBar } from '../components/cards';
import { useImpostorMatch } from '../store/matchStore';

/** Tela 16: Resultado em 3 tempos (o `stage` vem do servidor, então todos veem juntos). */
export function ResultScreen() {
  const match = useImpostorMatch();
  const pad = useScreenPadding();
  const result = match?.result;
  const stage = result?.stage ?? 0;
  const caught = !!result?.caught;

  const bg = useSharedValue(0);
  useEffect(() => {
    if (stage !== 2) return;
    bg.value = withTiming(1, { duration: 600 });
    if (caught) haptics.success();
    else haptics.error();
  }, [stage, caught, bg]);
  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(bg.value, [0, 1], [colors.background, caught ? colors.resultWin : colors.resultLose]),
  }));

  if (!match || !result) return null;
  const { player, displayName } = match;
  const chosen = player(result.chosenId);
  const impostorName = displayName(result.impostorId);
  const chosenName = displayName(result.chosenId);
  const maxVotes = Math.max(...result.tally.map((t) => t.votes));
  const totalVotes = result.tally.reduce((sum, t) => sum + t.votes, 0);
  const headline =
    result.headline.target === 'group'
      ? `+${result.headline.points} para o grupo`
      : `+${result.headline.points} para ${displayName(result.headline.target)}`;

  return (
    <Animated.View style={[{ flex: 1, gap: 18 }, pad, bgStyle]}>
      {stage === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <Display size={44} center>
            {'O grupo\nescolheu...'}
          </Display>
          <Dots size={14} gap={10} />
        </View>
      )}

      {stage === 1 && chosen && (
        <Enter kind="pop" duration={700} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <Avatar name={chosen.name} color={chosen.color} size={130} halo={{ width: 12, color: `${chosen.color}40` }} />
          <Display size={72} center adjustsFontSizeToFit numberOfLines={1}>
            👀 {chosenName}
          </Display>
        </Enter>
      )}

      {stage === 2 && (
        <>
          <Enter kind="pop" duration={600} style={{ alignItems: 'center', paddingTop: 10 }}>
            <Txt size={60} lh={1.15}>
              {caught ? '🎉' : '💀'}
            </Txt>
            <Display size={52} center style={{ marginTop: 10 }}>
              {caught ? 'Vocês acertaram!' : 'O impostor escapou'}
            </Display>
            <Txt size={15} lh={1.4} color="rgba(250,250,250,0.85)" center style={{ marginTop: 8 }}>
              {caught
                ? `${impostorName} era o impostor. A palavra era ${result.word.toUpperCase()}.`
                : `${chosenName} era inocente. O impostor era ${impostorName}.`}
            </Txt>
          </Enter>

          <Enter delay={300} duration={600}>
            <View style={{ backgroundColor: colors.overlayDarker, borderRadius: radii.card, paddingVertical: 18, paddingHorizontal: 20, gap: 12 }}>
              <Overline color="rgba(250,250,250,0.7)">Votação</Overline>
              {result.tally.map((t) => {
                const p = player(t.playerId);
                if (!p) return null;
                return (
                  <View key={t.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Avatar name={p.name} color={p.color} size={32} />
                    <Txt font="body600" size={15} style={{ width: 64 }} numberOfLines={1}>
                      {displayName(t.playerId)}
                    </Txt>
                    <VoteBar ratio={t.votes / totalVotes} highlight={t.votes === maxVotes} />
                    <Display size={18} style={{ width: 56, textAlign: 'right' }}>
                      {t.votes} {plural(t.votes, 'voto', 'votos')}
                    </Display>
                  </View>
                );
              })}
            </View>
          </Enter>

          <Enter delay={500} duration={600}>
            <View
              style={{
                backgroundColor: colors.overlayDarker,
                borderRadius: radii.card,
                paddingVertical: 16,
                paddingHorizontal: 20,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Txt font="body600" size={14}>
                Pontos da rodada
              </Txt>
              <Display size={28} color={colors.accent} numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1, textAlign: 'right' }}>
                {headline}
              </Display>
            </View>
          </Enter>

          <Spacer />
          <Button label="Ver placar" variant="onColor" onPress={() => router.replace(routes.match.ranking)} />
        </>
      )}
    </Animated.View>
  );
}

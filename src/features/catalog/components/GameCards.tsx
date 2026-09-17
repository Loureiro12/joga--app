import { View } from 'react-native';

import { colors, onColor, radii } from '@/core/theme';
import { Badge, Display, PressableScale, Txt } from '@/core/ui';

import { playersShort, type GameDefinition } from '../data/games';
import { GameArt } from './GameArt';

type CardProps = { game: GameDefinition; onPress: () => void };

/** Game card grande (hero da Home): raio 28, min 250, título 52, "Jogar agora". */
export function GameCardHero({ game, onPress }: CardProps) {
  const fg = onColor(game.color);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${game.name}. ${game.tagline}`}
      pressedScale={0.98}
      onPress={onPress}
      style={{ backgroundColor: game.color, borderRadius: radii.cardLg, padding: 22, paddingBottom: 20, minHeight: 250, justifyContent: 'flex-end', overflow: 'hidden' }}
    >
      <View style={{ position: 'absolute', right: -10, top: 14 }}>
        <GameArt game={game} width={210} blink={5000} />
      </View>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Badge label={game.category} kind="onColor" size={11} />
          {game.trending && <Badge label="Em alta" kind="hot" size={11} />}
        </View>
        <Display size={52} color={fg}>
          {game.name}
        </Display>
        <Txt size={15} lh={1.35} color={fg} opacity={0.85} style={{ maxWidth: 240 }}>
          {game.tagline}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <View style={{ flexDirection: 'row', gap: 12, flexShrink: 1 }}>
            <Txt font="body600" size={13} color={fg} opacity={0.8}>
              {game.playersLabel}
            </Txt>
            <Txt font="body600" size={13} color={fg} opacity={0.8}>
              {game.durationLabel}
            </Txt>
          </View>
          <View style={{ backgroundColor: colors.text, borderRadius: radii.pill, paddingVertical: 12, paddingHorizontal: 18 }}>
            <Display font="display700" size={17} ls={0.3} color={colors.background}>
              Jogar agora
            </Display>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

/** Game card médio (grid da Home): raio 24, min 196, título 24. */
export function GameCardMedium({ game, onPress }: CardProps) {
  const fg = onColor(game.color);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${game.name}. ${game.tagline}`}
      pressedScale={0.98}
      onPress={onPress}
      style={{ flex: 1, backgroundColor: game.color, borderRadius: radii.card, padding: 16, paddingTop: 18, minHeight: 196, justifyContent: 'flex-end', overflow: 'hidden' }}
    >
      <View style={{ position: 'absolute', right: 8, top: 10 }}>
        <GameArt game={game} width={86} />
      </View>
      <Txt font="body600" size={10} ls={0.6} upper color={fg} opacity={0.7} style={{ marginBottom: 6 }}>
        {game.category}
      </Txt>
      <Display size={24} color={fg}>
        {game.name}
      </Display>
      <Txt size={12} lh={1.35} color={fg} opacity={0.8} style={{ marginTop: 6 }}>
        {game.tagline}
      </Txt>
      <Txt font="body600" size={12} color={fg} opacity={0.75} style={{ marginTop: 10 }}>
        {game.playersLabel}
      </Txt>
    </PressableScale>
  );
}

/** Game card compacto (Explorar): raio 22, min 150. */
export function GameCardCompact({ game, onPress }: CardProps) {
  const fg = onColor(game.color);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={game.name}
      pressedScale={0.98}
      onPress={onPress}
      style={{ flex: 1, backgroundColor: game.color, borderRadius: radii.cardSm, padding: 16, minHeight: 150, justifyContent: 'space-between' }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt font="body600" size={10} ls={0.6} upper color={fg} opacity={0.75}>
          {game.category}
        </Txt>
        <Txt size={22}>{game.emoji}</Txt>
      </View>
      <View>
        <Display size={22} color={fg}>
          {game.name}
        </Display>
        <Txt size={12} lh={1.3} color={fg} opacity={0.8} style={{ marginTop: 5 }}>
          {playersShort(game)} · {game.durationShort}
        </Txt>
      </View>
    </PressableScale>
  );
}

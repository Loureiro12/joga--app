import { router } from 'expo-router';
import { View } from 'react-native';

import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Display, Overline, PressableScale, Txt } from '@/core/ui';
import { gamesForRoom } from '@/features/catalog/data/games';
import { haptics } from '@/core/utils/haptics';

export function GamePicker({ titulo = 'Escolha o jogo' }: { titulo?: string }) {
  return (
    <View style={{ gap: 10 }}>
      <Overline>{titulo}</Overline>
      {gamesForRoom().map((game) => (
        <PressableScale
          key={game.id}
          accessibilityRole="button"
          accessibilityLabel={`Escolher ${game.name}`}
          pressedScale={0.98}
          onPress={() => {
            haptics.selection();
            router.push(routes.chooseGame(game.id));
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: colors.surface,
            borderRadius: radii.card,
            paddingVertical: 12,
            paddingHorizontal: 14,
          }}
        >
          <View style={{ width: 44, height: 44, borderRadius: radii.input, backgroundColor: game.color, alignItems: 'center', justifyContent: 'center' }}>
            <Txt size={22}>{game.emoji}</Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Display size={18}>{game.name}</Display>
            <Txt font="body400" size={12} lh={1.3} color={colors.muted} numberOfLines={1}>
              {game.tagline}
            </Txt>
          </View>
          <Txt size={16} color={colors.muted}>
            →
          </Txt>
        </PressableScale>
      ))}
    </View>
  );
}

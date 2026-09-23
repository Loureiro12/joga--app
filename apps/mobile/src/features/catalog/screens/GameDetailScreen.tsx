import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { routes } from '@/core/navigation/routes';
import { colors, onColor } from '@/core/theme';
import { BackButton, Button, Chip, Display, ErrorState, Screen, Spacer, Txt } from '@/core/ui';

import { GameArt } from '../components/GameArt';
import { HowToPlaySheet } from '../components/HowToPlaySheet';
import { getGame } from '../data/games';

/** Tela 7: Detalhes do jogo. Genérica: funciona para qualquer item do catálogo. */
export function GameDetailScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState(false);
  const game = getGame(gameId);

  if (!game) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ErrorState title="Jogo não encontrado" subtitle="Esse jogo não existe mais ou o link está errado." />
        <Button label="Voltar ao início" variant="secondary" onPress={() => router.replace(routes.home)} />
      </Screen>
    );
  }

  const fg = onColor(game.color);
  const topPad = Math.max(insets.top + 6, 30);
  const wide = game.illustration === 'eyes' || game.illustration === 'mask' || game.illustration === 'pillArrow';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={{ backgroundColor: game.color, paddingTop: topPad, paddingHorizontal: 20, paddingBottom: 26, minHeight: 330, justifyContent: 'space-between' }}>
          {/* espaço do botão voltar, que fica fixo por cima do scroll */}
          <View style={{ height: 44 }} />
          <View style={{ alignSelf: 'center', marginVertical: 6 }}>
            <GameArt game={game} width={wide ? 260 : 150} blink={4000} />
          </View>
          <Display size={60} color={fg}>
            {game.name}
          </Display>
        </View>

        <View style={{ flex: 1, paddingTop: 22, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom + 8, 24), gap: 18 }}>
          <Txt font="body400" size={17} lh={1.45}>
            {game.description}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(game.infoChips.length ? game.infoChips : [{ emoji: '👥', label: game.playersLabel }, { emoji: '⏱', label: game.durationLabel }]).map((c) => (
              <Chip key={c.label} emoji={c.emoji} label={c.label} state="info" />
            ))}
          </View>
          <Spacer />
          {game.playable ? (
            <>
              <Button label={game.device === 'local' ? 'Começar' : 'Criar partida'} onPress={() => router.push(game.device === 'local' ? routes.bomb.setup(game.bombVariant ?? 'classico') : routes.createMatch(game.id))} />
              <Button label="Como jogar" variant="secondary" onPress={() => setSheet(true)} />
            </>
          ) : (
            <Button label="Em breve" disabled />
          )}
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', top: topPad, left: 20 }}>
        <BackButton onPress={() => router.back()} bg={colors.scrimLight} />
      </View>
      <HowToPlaySheet game={game} visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}

import { View } from 'react-native';

import { colors } from '@/core/theme';
import { BottomSheet, Button, Display, Txt } from '@/core/ui';

import type { GameDefinition } from '../data/games';

export function HowToPlaySheet({ game, visible, onClose }: { game: GameDefinition; visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Display size={30}>Como jogar</Display>
      {game.howToPlay.map((step, i) => (
        <View key={step} style={{ flexDirection: 'row', gap: 12 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Display size={16}>{i + 1}</Display>
          </View>
          <Txt font="body400" size={15} lh={1.4} style={{ flex: 1 }}>
            {step}
          </Txt>
        </View>
      ))}
      <Button label="Entendi" variant="tertiary" height={52} radius={16} fontSize={20} onPress={onClose} style={{ marginTop: 6 }} />
    </BottomSheet>
  );
}

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/core/theme';
import { BottomSheet, Button, Display, Txt } from '@/core/ui';
import { services } from '@/services';

import { hasDebug } from '../services/RoomService';

/**
 * Menu de simulação (só em __DEV__ e só quando o RoomService é o mock).
 * Substitui os botões "Simular…" que ficavam fora do celular no protótipo.
 */
export function DevMenu() {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const room = services.room;
  if (!__DEV__ || !hasDebug(room)) return null;

  const actions: [string, () => void][] = [
    ['Host avança a fase', () => room.debug.hostAdvance()],
    ['Queda de conexão (recupera)', () => room.debug.simulateConnectionDrop({ recover: true })],
    ['Queda de conexão (falha)', () => room.debug.simulateConnectionDrop({ recover: false })],
    ['Um jogador desconecta', () => room.debug.simulatePlayerDisconnect()],
    ['Host saiu', () => room.debug.simulateHostLeft()],
    ['Jogadores insuficientes', () => room.debug.simulateNotEnoughPlayers()],
  ];

  return (
    <>
      <Pressable
        accessibilityLabel="Menu de simulação"
        onPress={() => setOpen(true)}
        style={{
          position: 'absolute',
          left: 8,
          top: insets.top + 2,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 99,
          borderWidth: 1,
          borderColor: colors.surfaceLight,
          backgroundColor: colors.background,
          opacity: 0.7,
        }}
      >
        <Txt font="body600" size={10} color={colors.muted}>
          DEV
        </Txt>
      </Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <Display size={26}>Simulações</Display>
        <View style={{ gap: 8 }}>
          {actions.map(([label, run]) => (
            <Button
              key={label}
              label={label}
              variant="tertiary"
              height={48}
              radius={14}
              fontSize={18}
              onPress={() => {
                setOpen(false);
                run();
              }}
            />
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

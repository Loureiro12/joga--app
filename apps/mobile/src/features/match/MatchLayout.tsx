import { useKeepAwake } from 'expo-keep-awake';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, Platform, View } from 'react-native';

import { colors } from '@/core/theme';
import { useSettingsStore } from '@/features/settings/settingsStore';

import { ConnectionOverlay } from './components/ConnectionOverlay';
import { DevMenu } from './components/DevMenu';
import { useMatchNavigator } from './hooks/useMatchNavigator';

function KeepAwake() {
  useKeepAwake();
  return null;
}

/**
 * Stack do fluxo de partida (telas 9, 11–21): tela cheia, sem tab bar e sem gesto de voltar —
 * sair só pelo botão de pausa. A navegação entre as telas é dirigida pela fase da sala.
 */
export function MatchLayout() {
  useMatchNavigator();
  const keepAwake = useSettingsStore((s) => s.keepAwake);

  // Botão físico de voltar só existe no Android; no iOS o gesto já está desligado no Stack.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {keepAwake && <KeepAwake />}
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false, animation: 'fade', contentStyle: { backgroundColor: colors.background } }} />
      <ConnectionOverlay />
      <DevMenu />
    </View>
  );
}

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors, fontAssets } from '@/core/theme';
import { ToastHost } from '@/core/ui';
import { useAuthSync } from '@/features/auth/useAuthSync';
// Registra o listener do RoomService e o gate de vibração antes de qualquer tela.
import '@/features/match/store/matchStore';
import '@/features/settings/settingsStore';
import { useFriendInviteSync } from '@/features/social/useFriendInviteSync';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts(fontAssets);
  useAuthSync();
  useFriendInviteSync();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="(auth)" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="premium" options={{ presentation: 'modal' }} />
          {/* Bomba-Relógio: a rodada é tela cheia e sem gesto de voltar — sair no meio explodiria a brincadeira. */}
          <Stack.Screen name="bomb/round" options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="bomb/end" options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
          {/* Fluxo de partida: modal em tela cheia, sem gesto de voltar (sair só pela pausa). */}
          <Stack.Screen name="match" options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
        </Stack>
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

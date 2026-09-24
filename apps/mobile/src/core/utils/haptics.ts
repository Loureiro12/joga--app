import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Objeto (e não `let`) de propósito: no web o Metro elimina o ramo nativo e removia a declaração,
// deixando a atribuição órfã em `configure`.
const config = { isEnabled: (): boolean => true };

/** Feedback tátil do app. Respeita a configuração "Vibração" (injetada pelo settingsStore). */
export const haptics = {
  configure(getter: () => boolean) {
    config.isEnabled = getter;
  },
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  heavy: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  selection: () => run(() => Haptics.selectionAsync()),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /**
   * Duas batidas curtas: "é a sua vez".
   *
   * Duas, e não uma, porque na Bomba-Relógio em sala o celular está no bolso ou na mesa e uma
   * batida só se confunde com notificação. O intervalo é curto de propósito — o jogo é de pressa.
   */
  turn: () => {
    haptics.heavy();
    setTimeout(() => haptics.heavy(), 160);
  },
};

function run(fn: () => Promise<void>) {
  if (Platform.OS === 'web' || !config.isEnabled()) return;
  fn().catch(() => {});
}

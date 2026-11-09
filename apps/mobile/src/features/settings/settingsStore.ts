import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { haptics } from '@/core/utils/haptics';
import { persistStorage } from '@/core/utils/storage';

/**
 * `telemetry` é o único destes que sai do aparelho: ele decide se o Firebase coleta uso e
 * desempenho. Padrão ligado, e a política de privacidade do site descreve exatamente isto.
 */
export type SettingKey = 'sound' | 'vibe' | 'keepAwake' | 'notif' | 'telemetry';

type SettingsState = Record<SettingKey, boolean> & { toggle: (key: SettingKey) => void };

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      sound: true,
      vibe: true,
      keepAwake: true,
      notif: false,
      telemetry: true,
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<SettingsState>),
    }),
    {
      name: 'jogae.settings',
      storage: persistStorage,
      partialize: ({ sound, vibe, keepAwake, notif, telemetry }) => ({ sound, vibe, keepAwake, notif, telemetry }),
    },
  ),
);

haptics.configure(() => useSettingsStore.getState().vibe);

/**
 * O interruptor de telemetria, lido sem importar o store.
 *
 * O serviço do Firebase sobe antes de qualquer tela e não pode importar este módulo direto: o
 * `persist` depende do AsyncStorage, e um ciclo de import na subida é o tipo de coisa que quebra
 * só no build nativo, que é onde é mais caro descobrir.
 */
export const telemetryOptedIn = (): boolean => useSettingsStore.getState().telemetry;

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { haptics } from '@/core/utils/haptics';
import { persistStorage } from '@/core/utils/storage';

export type SettingKey = 'sound' | 'vibe' | 'keepAwake' | 'notif';

type SettingsState = Record<SettingKey, boolean> & { toggle: (key: SettingKey) => void };

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      sound: true,
      vibe: true,
      keepAwake: true,
      notif: false,
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<SettingsState>),
    }),
    {
      name: 'jogae.settings',
      storage: persistStorage,
      partialize: ({ sound, vibe, keepAwake, notif }) => ({ sound, vibe, keepAwake, notif }),
    },
  ),
);

haptics.configure(() => useSettingsStore.getState().vibe);

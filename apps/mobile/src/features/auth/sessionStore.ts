import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from '@/core/utils/storage';

import type { AuthUser } from './AuthService';

type SessionState = {
  user: AuthUser | null;
  hasOnboarded: boolean;
  /** `true` depois que o estado persistido foi lido do disco. */
  hydrated: boolean;
  /** `true` depois que a sessão foi conferida com o AuthService (ver `useAuthSync`). */
  authReady: boolean;
  setUser: (user: AuthUser | null) => void;
  completeOnboarding: () => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      hasOnboarded: false,
      hydrated: false,
      authReady: false,
      setUser: (user) => set({ user }),
      completeOnboarding: () => set({ hasOnboarded: true }),
    }),
    {
      name: 'jogae.session',
      storage: persistStorage,
      partialize: ({ user, hasOnboarded }) => ({ user, hasOnboarded }),
      onRehydrateStorage: () => () => useSessionStore.setState({ hydrated: true }),
    },
  ),
);

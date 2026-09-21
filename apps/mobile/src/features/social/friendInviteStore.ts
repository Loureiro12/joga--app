import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from '@/core/utils/storage';

type FriendInviteState = {
  /** @username de um link de convite que ainda não virou amizade (ex.: a pessoa abriu o link sem estar logada). */
  pending: string | null;
  /** Sobe a cada amizade criada; a tela Amigos recarrega quando muda. */
  version: number;
  setPending: (username: string | null) => void;
  bump: () => void;
};

/** Persistido: o link pode chegar antes do login, e o convite tem que sobreviver ao cadastro. */
export const useFriendInviteStore = create<FriendInviteState>()(
  persist(
    (set) => ({
      pending: null,
      version: 0,
      setPending: (pending) => set({ pending }),
      bump: () => set((s) => ({ version: s.version + 1 })),
    }),
    { name: 'jogae.friend-invite', storage: persistStorage, partialize: ({ pending }) => ({ pending }) },
  ),
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { playerColors } from '@/core/theme';
import { persistStorage } from '@/core/utils/storage';

export type Profile = { name: string; username: string; color: string };

type ProfileState = Profile & {
  update: (patch: Partial<Profile>) => void;
  /** Preenche o perfil a partir do nome da conta recém-criada. */
  seedFromName: (name: string) => void;
};

export const sanitizeUsername = (raw: string) => raw.replace(/[^a-z0-9_.]/gi, '').toLowerCase();

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      name: 'Convidado',
      username: 'convidado',
      color: playerColors[0],
      update: (patch) => set(patch),
      seedFromName: (name) => set({ name, username: sanitizeUsername(name.normalize('NFD').replace(/[̀-ͯ]/g, '')) || 'jogador' }),
    }),
    { name: 'jogae.profile', storage: persistStorage, partialize: ({ name, username, color }) => ({ name, username, color }) },
  ),
);

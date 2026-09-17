import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from '@/core/utils/storage';

type PremiumState = { isPremium: boolean; setPremium: (v: boolean) => void };

/** Cache local do entitlement `premium`. Na fase 2 é sincronizado pelo listener do RevenueCat. */
export const usePremiumStore = create<PremiumState>()(
  persist((set) => ({ isPremium: false, setPremium: (isPremium) => set({ isPremium }) }), {
    name: 'jogae.premium',
    storage: persistStorage,
  }),
);

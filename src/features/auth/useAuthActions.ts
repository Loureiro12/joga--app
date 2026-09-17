import { router } from 'expo-router';

import { routes } from '@/core/navigation/routes';
import { useProfileStore } from '@/features/profile/profileStore';
import { services } from '@/services';

import type { AuthUser } from './AuthService';
import { useSessionStore } from './sessionStore';

/** Efeitos comuns a qualquer forma de entrar: guarda a sessão, semeia o perfil e vai para a Home. */
function enter(user: AuthUser) {
  useSessionStore.getState().setUser(user);
  if (!user.isGuest) useProfileStore.getState().seedFromName(user.name);
  router.replace(routes.home);
}

export const authActions = {
  signIn: async (email: string, password: string) => enter(await services.auth.signInWithEmail(email, password)),
  signUp: async (name: string, email: string, password: string) => enter(await services.auth.signUpWithEmail(name, email, password)),
  provider: async (provider: 'google' | 'apple') => enter(await services.auth.signInWithProvider(provider)),
  guest: async () => enter(await services.auth.signInAsGuest()),
  signOut: async () => {
    await services.auth.signOut();
    useSessionStore.getState().setUser(null);
    router.dismissAll();
    router.replace(routes.login);
  },
};

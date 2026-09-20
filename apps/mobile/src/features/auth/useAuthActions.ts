import { router } from 'expo-router';

import { routes } from '@/core/navigation/routes';
import { useProfileStore } from '@/features/profile/profileStore';
import { services } from '@/services';

import type { AuthUser } from './AuthService';
import { useSessionStore } from './sessionStore';

/** Carrega o perfil do servidor para o store; no mock (sem perfil remoto) semeia a partir do nome. */
export async function syncProfile(user: AuthUser) {
  const remote = await services.profile.getMyProfile(user.id).catch(() => null);
  if (remote) useProfileStore.getState().update(remote);
  else if (!services.auth.managesSession && !user.isGuest) useProfileStore.getState().seedFromName(user.name);
}

/** Efeitos comuns a qualquer forma de entrar: guarda a sessão, carrega o perfil e vai para a Home. */
async function enter(user: AuthUser) {
  useSessionStore.getState().setUser(user);
  await syncProfile(user);
  router.dismissAll();
  router.replace(routes.home);
}

/** Idempotente: o `useAuthSync` pode já ter reagido ao SIGNED_OUT e levado ao login. */
function leave() {
  const wasSignedIn = useSessionStore.getState().user !== null;
  useSessionStore.getState().setUser(null);
  useProfileStore.getState().reset();
  if (!wasSignedIn) return;
  router.dismissAll();
  router.replace(routes.login);
}

export const authActions = {
  signIn: async (email: string, password: string) => enter(await services.auth.signInWithEmail(email, password)),
  signUp: async (name: string, email: string, password: string) => enter(await services.auth.signUpWithEmail(name, email, password)),
  provider: async (provider: 'google' | 'apple') => enter(await services.auth.signInWithProvider(provider)),
  guest: async () => enter(await services.auth.signInAsGuest()),
  completePasswordReset: async (code: string, password: string) => enter(await services.auth.completePasswordReset(code, password)),
  signOut: async () => {
    await services.auth.signOut().catch(() => {});
    leave();
  },
  deleteAccount: async () => {
    await services.auth.deleteAccount();
    leave();
  },
};

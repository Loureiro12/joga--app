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

/** Esvazia o stack antes de trocar a raiz. `dismissAll` sem nada para fechar gera o aviso POP_TO_TOP. */
export function resetTo(route: string) {
  if (router.canDismiss()) router.dismissAll();
  router.replace(route);
}

/**
 * Efeitos comuns a qualquer forma de entrar: guarda a sessão, carrega o perfil e vai para a Home.
 *
 * É aqui também que a telemetria passa a saber **quem** é a pessoa — pelo id da conta, um UUID.
 * Nunca pelo e-mail: o id liga os eventos de uma mesma pessoa entre sessões sem dizer quem ela é,
 * e é isso que a política de privacidade promete.
 */
async function enter(user: AuthUser, metodo?: string, novo?: boolean) {
  useSessionStore.getState().setUser(user);
  services.telemetry.identify(user.id);
  if (metodo) services.telemetry.track(novo ? { name: 'conta_criada', metodo } : { name: 'login', metodo });
  await syncProfile(user);
  resetTo(routes.home);
}

/** Idempotente: o `useAuthSync` pode já ter reagido ao SIGNED_OUT e levado ao login. */
function leave() {
  const wasSignedIn = useSessionStore.getState().user !== null;
  // Desidentifica antes de limpar: o que vier depois é de um aparelho, não de uma conta.
  services.telemetry.identify(null);
  useSessionStore.getState().setUser(null);
  useProfileStore.getState().reset();
  if (!wasSignedIn) return;
  resetTo(routes.login);
}

export const authActions = {
  signIn: async (email: string, password: string) => enter(await services.auth.signInWithEmail(email, password), 'email'),
  signUp: async (name: string, email: string, password: string) => enter(await services.auth.signUpWithEmail(name, email, password), 'email', true),
  provider: async (provider: 'google' | 'apple') => enter(await services.auth.signInWithProvider(provider), provider),
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

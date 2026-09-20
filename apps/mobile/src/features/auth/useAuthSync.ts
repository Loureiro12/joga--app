import { router } from 'expo-router';
import { useEffect } from 'react';

import { routes } from '@/core/navigation/routes';
import { useProfileStore } from '@/features/profile/profileStore';
import { services } from '@/services';

import { useSessionStore } from './sessionStore';
import { syncProfile } from './useAuthActions';

/**
 * Mantém o `sessionStore` fiel ao AuthService. Montado uma vez no layout raiz.
 * - Na abertura: confere a sessão guardada (o Splash espera `authReady`).
 * - Depois: se a sessão cair por fora (token revogado, conta apagada em outro aparelho), volta ao login.
 */
export function useAuthSync() {
  useEffect(() => {
    const { auth } = services;
    if (!auth.managesSession) {
      useSessionStore.setState({ authReady: true });
      return;
    }

    let alive = true;
    auth
      .getCurrentUser()
      .then(async (user) => {
        if (!alive) return;
        useSessionStore.setState({ user, authReady: true });
        if (user) await syncProfile(user);
        else useProfileStore.getState().reset();
      })
      .catch(() => alive && useSessionStore.setState({ authReady: true }));

    const unsubscribe = auth.onAuthStateChange((user) => {
      const had = useSessionStore.getState().user;
      useSessionStore.setState({ user });
      if (had && !user) {
        useProfileStore.getState().reset();
        router.dismissAll();
        router.replace(routes.login);
      }
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
}

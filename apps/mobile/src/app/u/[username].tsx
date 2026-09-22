import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { routes } from '@/core/navigation/routes';
import { useSessionStore } from '@/features/auth/sessionStore';
import { useFriendInviteStore } from '@/features/social/friendInviteStore';

/**
 * Deep link `jogaeapp.com.br/u/vinicosta`: guarda o convite e segue. Quem grava a amizade é o
 * `useFriendInviteSync`, quando houver alguém logado — sem login, o convite espera o cadastro.
 */
export default function FriendInviteDeepLink() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const loggedIn = useSessionStore((s) => Boolean(s.user));

  useEffect(() => {
    if (username) useFriendInviteStore.getState().setPending(String(username));
  }, [username]);

  return <Redirect href={loggedIn ? routes.friends : '/'} />;
}

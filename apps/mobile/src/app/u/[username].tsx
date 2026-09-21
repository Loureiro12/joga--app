import { Redirect, useLocalSearchParams } from 'expo-router';

import { routes } from '@/core/navigation/routes';

/**
 * Deep link `jogaeapp.com.br/u/vinicosta` → tela Amigos, levando o @ de quem convidou.
 * O registro da amizade entra com o backend social (passo 5); por ora o link só precisa cair no lugar certo.
 */
export default function FriendInviteDeepLink() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <Redirect href={{ pathname: routes.friends, params: { invitedBy: username } }} />;
}

import { useEffect } from 'react';

import { toast } from '@/core/ui';
import { useSessionStore } from '@/features/auth/sessionStore';
import { services } from '@/services';

import { useFriendInviteStore } from './friendInviteStore';
import { SocialError } from './SocialService';

const MESSAGES: Partial<Record<SocialError['code'], string>> = {
  not_found: 'Esse convite não é de ninguém. Peça o link de novo.',
  rate_limited: 'Muitos convites em pouco tempo. Tente mais tarde.',
};

/**
 * Transforma o convite pendente em amizade assim que há alguém logado. Montado uma vez no layout raiz:
 * assim o convite vale tanto para quem já estava logado quanto para quem abriu o link antes de criar a conta.
 */
export function useFriendInviteSync() {
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const authReady = useSessionStore((s) => s.authReady);
  const pending = useFriendInviteStore((s) => s.pending);

  useEffect(() => {
    if (!authReady || !userId || !pending) return;
    let alive = true;
    services.social
      .addFriend(pending)
      .then((friend) => {
        if (!alive) return;
        useFriendInviteStore.getState().setPending(null);
        useFriendInviteStore.getState().bump();
        toast(friend.alreadyFriends ? `Você e ${friend.name} já são amigos` : `Você e ${friend.name} agora são amigos`, 'success', '👥');
      })
      .catch((e) => {
        if (!alive) return;
        const code = e instanceof SocialError ? e.code : 'unknown';
        // Falha de rede: mantém o convite para a próxima abertura. O resto não adianta repetir.
        if (code === 'unknown') return;
        useFriendInviteStore.getState().setPending(null);
        // Abrir o próprio link não é erro; só não há o que fazer.
        if (code !== 'self') toast(MESSAGES[code] ?? 'Não deu para aceitar o convite.', 'error');
      });
    return () => {
      alive = false;
    };
  }, [authReady, userId, pending]);
}

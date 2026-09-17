import { useSessionStore } from '@/features/auth/sessionStore';
import { useProfileStore } from '@/features/profile/profileStore';

import type { PlayerIdentity } from '../domain/types';

/** Quem sou eu na sala: id da sessão + nome/cor do perfil. */
export function getIdentity(): PlayerIdentity {
  const { user } = useSessionStore.getState();
  const { name, color } = useProfileStore.getState();
  return { id: user?.id ?? 'local', name, color };
}

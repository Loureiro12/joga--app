export type Friend = {
  id: string;
  name: string;
  username: string;
  color: string;
  gamesTogether: number;
  /** Vitórias do amigo (1º lugar, empates inclusos — a mesma regra do histórico). */
  trophies: number;
  /** Preenchido quando o amigo está em uma sala agora. `joinable`: ainda no lobby, dá para entrar. */
  playing?: { gameId: string; roomCode: string; joinable: boolean };
};

export type AddedFriend = { id: string; name: string; username: string; alreadyFriends: boolean };

export type SocialErrorCode = 'not_found' | 'self' | 'rate_limited' | 'unknown';

export class SocialError extends Error {
  constructor(
    readonly code: SocialErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'SocialError';
  }
}

/**
 * Amizade no Jogaê não tem pedido nem aceite: quem abre o link de convite de alguém
 * (`jogaeapp.com.br/u/{username}`) vira amigo na hora, dos dois lados.
 */
export interface SocialService {
  listFriends(): Promise<Friend[]>;
  /** O que o link de convite faz. Repetir é inofensivo (`alreadyFriends`). */
  addFriend(username: string): Promise<AddedFriend>;
  removeFriend(friendId: string): Promise<void>;
  inviteLink(username: string): string;
}

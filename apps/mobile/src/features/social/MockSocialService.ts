import { wait } from '@/core/utils/format';
import { SITE_HOST } from '@/core/utils/site';

import { SocialError, type AddedFriend, type Friend, type SocialService } from './SocialService';

// `/u/` evita colisão com as rotas fixas do site (um @termos ou @privacidade quebraria a página).
export const friendInviteLink = (username: string) => `${SITE_HOST}/u/${username}`;

const FRIENDS: Friend[] = [
  { id: 'f1', name: 'André', username: 'andre', color: '#7C3AED', gamesTogether: 18, trophies: 5, playing: { gameId: 'impostor', roomCode: '4827', joinable: true } },
  { id: 'f2', name: 'Carol', username: 'carolz', color: '#FACC15', gamesTogether: 15, trophies: 4, playing: { gameId: 'impostor', roomCode: '9130', joinable: false } },
  { id: 'f3', name: 'Lucas', username: 'lucasm', color: '#22C55E', gamesTogether: 12, trophies: 3 },
  { id: 'f4', name: 'Pedro', username: 'pedrao', color: '#A78BFA', gamesTogether: 9, trophies: 2 },
  { id: 'f5', name: 'João', username: 'joaov', color: '#EF4444', gamesTogether: 7, trophies: 1 },
  { id: 'f6', name: 'Bia', username: 'biars', color: '#27272F', gamesTogether: 4, trophies: 1 },
  { id: 'f7', name: 'Rafa', username: 'rafinha', color: '#FACC15', gamesTogether: 2, trophies: 0 },
];

/** Modo simulado (sem Supabase): amigos de mentira, para design e testes de UI. Nunca vai para as lojas. */
export class MockSocialService implements SocialService {
  private friends = [...FRIENDS];

  async listFriends() {
    await wait(500);
    return [...this.friends];
  }
  async addFriend(username: string): Promise<AddedFriend> {
    await wait(300);
    const clean = username.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(clean)) throw new SocialError('not_found');
    const known = this.friends.find((f) => f.username === clean);
    if (known) return { id: known.id, name: known.name, username: clean, alreadyFriends: true };
    const friend: Friend = { id: `f-${clean}`, name: clean, username: clean, color: '#22C55E', gamesTogether: 0, trophies: 0 };
    this.friends = [friend, ...this.friends];
    return { id: friend.id, name: friend.name, username: clean, alreadyFriends: false };
  }
  async removeFriend(friendId: string) {
    this.friends = this.friends.filter((f) => f.id !== friendId);
  }
  inviteLink = friendInviteLink;
}

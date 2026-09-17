import { wait } from '@/core/utils/format';

export type Friend = {
  id: string;
  name: string;
  username: string;
  color: string;
  gamesTogether: number;
  trophies: number;
  /** Preenchido quando o amigo está em uma sala agora. */
  playing?: { gameName: string; roomCode: string };
};

export interface SocialService {
  listFriends(): Promise<Friend[]>;
  inviteLink(username: string): string;
}

const FRIENDS: Friend[] = [
  { id: 'f1', name: 'André', username: 'andre', color: '#7C3AED', gamesTogether: 18, trophies: 5, playing: { gameName: 'Impostor', roomCode: '4827' } },
  { id: 'f2', name: 'Carol', username: 'carolz', color: '#FACC15', gamesTogether: 15, trophies: 4, playing: { gameName: 'Desafio secreto', roomCode: '9130' } },
  { id: 'f3', name: 'Lucas', username: 'lucasm', color: '#22C55E', gamesTogether: 12, trophies: 3 },
  { id: 'f4', name: 'Pedro', username: 'pedrão', color: '#A78BFA', gamesTogether: 9, trophies: 2 },
  { id: 'f5', name: 'João', username: 'joaov', color: '#EF4444', gamesTogether: 7, trophies: 1 },
  { id: 'f6', name: 'Bia', username: 'biars', color: '#27272F', gamesTogether: 4, trophies: 1 },
  { id: 'f7', name: 'Rafa', username: 'rafinha', color: '#FACC15', gamesTogether: 2, trophies: 0 },
];

export class MockSocialService implements SocialService {
  async listFriends() {
    await wait(500);
    return FRIENDS;
  }
  inviteLink(username: string) {
    return `jogae.app/${username}`;
  }
}

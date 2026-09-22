import type { SupabaseClient } from '@supabase/supabase-js';

import { SocialError, type AddedFriend, type Friend, type SocialService } from './SocialService';

type FriendRow = {
  id: string;
  name: string;
  username: string;
  color: string;
  games_together: number;
  trophies: number;
  playing_game: string | null;
  playing_code: string | null;
  playing_status: string | null;
};

/** As funções do banco avisam o motivo no `message` (ver a migration `friends`). */
function translate(error: { message?: string; code?: string }): SocialError {
  const message = error.message ?? '';
  if (message.includes('friend_not_found')) return new SocialError('not_found');
  if (message.includes('friend_is_self')) return new SocialError('self');
  if (message.includes('friend_rate_limited')) return new SocialError('rate_limited');
  return new SocialError('unknown', `${error.code ?? ''} ${message}`.trim());
}

/**
 * Amigos de verdade. O banco faz o trabalho pesado em `get_my_friends`: partidas em comum,
 * vitórias e a sala em que cada amigo está agora (que o servidor de salas mantém em `active_rooms`).
 */
export class SupabaseSocialService implements SocialService {
  constructor(
    private readonly supabase: SupabaseClient,
    readonly inviteLink: (username: string) => string,
  ) {}

  async listFriends(): Promise<Friend[]> {
    const { data, error } = await this.supabase.rpc('get_my_friends');
    if (error) throw translate(error);
    return ((data ?? []) as FriendRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      color: row.color,
      gamesTogether: row.games_together,
      trophies: row.trophies,
      playing: row.playing_code && row.playing_game ? { gameId: row.playing_game, roomCode: row.playing_code, joinable: row.playing_status === 'open' } : undefined,
    }));
  }

  async addFriend(username: string): Promise<AddedFriend> {
    const { data, error } = await this.supabase
      .rpc('add_friend_by_username', { target_username: username })
      .maybeSingle<{ id: string; name: string; username: string; already_friends: boolean }>();
    if (error) throw translate(error);
    if (!data) throw new SocialError('not_found');
    return { id: data.id, name: data.name, username: data.username, alreadyFriends: data.already_friends };
  }

  async removeFriend(friendId: string): Promise<void> {
    const { error } = await this.supabase.rpc('remove_friend', { friend_id: friendId });
    if (error) throw translate(error);
  }
}

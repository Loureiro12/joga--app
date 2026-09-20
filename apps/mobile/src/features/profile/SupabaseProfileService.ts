import type { SupabaseClient } from '@supabase/supabase-js';

import { ProfileError, type ProfileService, type UsernameStatus } from './ProfileService';
import type { Profile } from './profileStore';

const COLUMNS = 'name, username, color';

export class SupabaseProfileService implements ProfileService {
  constructor(private readonly supabase: SupabaseClient) {}

  async getMyProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase.from('profiles').select(COLUMNS).eq('id', userId).maybeSingle();
    if (error) throw new ProfileError('unknown', error.message);
    return data;
  }

  async updateMyProfile(userId: string, patch: Partial<Profile>): Promise<Profile | null> {
    const { data, error } = await this.supabase.from('profiles').update(patch).eq('id', userId).select(COLUMNS).maybeSingle();
    if (error) {
      // 23505 = unique_violation (alguém pegou o username entre a checagem e o salvar); 23514 = check_violation.
      if (error.code === '23505') throw new ProfileError('username_taken');
      if (error.code === '23514') throw new ProfileError('invalid', error.message);
      throw new ProfileError('unknown', error.message);
    }
    return data;
  }

  async checkUsername(username: string, currentUserId?: string): Promise<UsernameStatus> {
    if (username.length < 3) return 'too_short';
    const { data, error } = await this.supabase.from('profiles').select('id').eq('username', username).maybeSingle();
    if (error) throw new ProfileError('unknown', error.message);
    return !data || data.id === currentUserId ? 'available' : 'taken';
  }
}

import { wait } from '@/core/utils/format';

import type { Profile } from './profileStore';

export type UsernameStatus = 'too_short' | 'taken' | 'available';

export type ProfileErrorCode = 'username_taken' | 'invalid' | 'network' | 'unknown';

export class ProfileError extends Error {
  constructor(public readonly code: ProfileErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ProfileError';
  }
}

export interface ProfileService {
  /** `null` quando o serviço não guarda perfil (mock): o app mantém o perfil local. */
  getMyProfile(userId: string): Promise<Profile | null>;
  updateMyProfile(userId: string, patch: Partial<Profile>): Promise<Profile | null>;
  /** `currentUserId` evita marcar como "em uso" o username que já é do próprio usuário. */
  checkUsername(username: string, currentUserId?: string): Promise<UsernameStatus>;
}

const TAKEN = new Set(['andre', 'jogae', 'admin']);

export class MockProfileService implements ProfileService {
  async getMyProfile(): Promise<Profile | null> {
    return null;
  }
  async updateMyProfile(): Promise<Profile | null> {
    await wait(300);
    return null;
  }
  async checkUsername(username: string): Promise<UsernameStatus> {
    if (username.length < 3) return 'too_short';
    await wait(250);
    return TAKEN.has(username) ? 'taken' : 'available';
  }
}

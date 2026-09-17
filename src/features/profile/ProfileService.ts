import { wait } from '@/core/utils/format';

export type UsernameStatus = 'too_short' | 'taken' | 'available';

export interface ProfileService {
  checkUsername(username: string): Promise<UsernameStatus>;
}

const TAKEN = new Set(['andre', 'jogae', 'admin']);

export class MockProfileService implements ProfileService {
  async checkUsername(username: string): Promise<UsernameStatus> {
    if (username.length < 3) return 'too_short';
    await wait(250);
    return TAKEN.has(username) ? 'taken' : 'available';
  }
}

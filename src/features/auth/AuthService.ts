import { wait } from '@/core/utils/format';

export type AuthUser = { id: string; name: string; email: string | null; isGuest: boolean };

export type AuthErrorCode = 'invalid_credentials' | 'email_in_use' | 'network';

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthError';
  }
}

/** Fase 2: implementar com Supabase Auth / expo-auth-session (Google, Apple, e-mail, anônimo). */
export interface AuthService {
  signInWithEmail(email: string, password: string): Promise<AuthUser>;
  signUpWithEmail(name: string, email: string, password: string): Promise<AuthUser>;
  signInWithProvider(provider: 'google' | 'apple'): Promise<AuthUser>;
  signInAsGuest(): Promise<AuthUser>;
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const newId = () => `u_${Math.random().toString(36).slice(2, 10)}`;
const nameFromEmail = (email: string) => {
  const base = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return base ? base.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Jogador';
};

export class MockAuthService implements AuthService {
  async signInWithEmail(email: string): Promise<AuthUser> {
    await wait(900);
    return { id: newId(), name: nameFromEmail(email), email, isGuest: false };
  }
  async signUpWithEmail(name: string, email: string): Promise<AuthUser> {
    await wait(900);
    return { id: newId(), name: name.trim(), email, isGuest: false };
  }
  async signInWithProvider(provider: 'google' | 'apple'): Promise<AuthUser> {
    await wait(400);
    return { id: newId(), name: 'Vini Costa', email: `vini@${provider === 'google' ? 'gmail.com' : 'icloud.com'}`, isGuest: false };
  }
  async signInAsGuest(): Promise<AuthUser> {
    return { id: newId(), name: 'Convidado', email: null, isGuest: true };
  }
  async sendPasswordReset(): Promise<void> {
    await wait(500);
  }
  async signOut(): Promise<void> {}
}

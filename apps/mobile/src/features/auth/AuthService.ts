import { wait } from '@/core/utils/format';

export type AuthUser = { id: string; name: string; email: string | null; isGuest: boolean };

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_in_use'
  | 'weak_password'
  /** Conta criada, mas o projeto exige confirmar o e-mail antes de entrar. */
  | 'confirm_email'
  | 'rate_limited'
  | 'network'
  /** O usuário fechou a janela do Google/Apple. Não é erro para mostrar. */
  | 'cancelled'
  | 'provider_unavailable'
  | 'not_authenticated'
  | 'unknown';

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'AuthError';
  }
}

export type AuthProvider = 'google' | 'apple';

export interface AuthService {
  /**
   * `true` quando o serviço guarda e renova a sessão sozinho (Supabase). O app então
   * sincroniza o `sessionStore` a partir dele; com `false` (mock) vale o que está persistido.
   */
  readonly managesSession: boolean;
  getCurrentUser(): Promise<AuthUser | null>;
  onAuthStateChange(listener: (user: AuthUser | null) => void): () => void;

  signInWithEmail(email: string, password: string): Promise<AuthUser>;
  /** Se a sessão atual for de convidado, converte o convidado em conta (mesmo id, mesmo histórico). */
  signUpWithEmail(name: string, email: string, password: string): Promise<AuthUser>;
  signInWithProvider(provider: AuthProvider): Promise<AuthUser>;
  signInAsGuest(): Promise<AuthUser>;

  sendPasswordReset(email: string): Promise<void>;
  /** Troca o `code` do link de redefinição por uma sessão e grava a nova senha. */
  completePasswordReset(code: string, newPassword: string): Promise<AuthUser>;

  signOut(): Promise<void>;
  /** Apaga a conta e todos os dados do usuário. Irreversível. */
  deleteAccount(): Promise<void>;
}

const newId = () => `u_${Math.random().toString(36).slice(2, 10)}`;
const nameFromEmail = (email: string) => {
  const base = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return base ? base.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Jogador';
};

export class MockAuthService implements AuthService {
  readonly managesSession = false;
  async getCurrentUser(): Promise<AuthUser | null> {
    return null;
  }
  onAuthStateChange(): () => void {
    return () => {};
  }
  async signInWithEmail(email: string): Promise<AuthUser> {
    await wait(900);
    return { id: newId(), name: nameFromEmail(email), email, isGuest: false };
  }
  async signUpWithEmail(name: string, email: string): Promise<AuthUser> {
    await wait(900);
    return { id: newId(), name: name.trim(), email, isGuest: false };
  }
  async signInWithProvider(provider: AuthProvider): Promise<AuthUser> {
    await wait(400);
    return { id: newId(), name: 'Vini Costa', email: `vini@${provider === 'google' ? 'gmail.com' : 'icloud.com'}`, isGuest: false };
  }
  async signInAsGuest(): Promise<AuthUser> {
    return { id: newId(), name: 'Convidado', email: null, isGuest: true };
  }
  async sendPasswordReset(): Promise<void> {
    await wait(500);
  }
  async completePasswordReset(): Promise<AuthUser> {
    await wait(500);
    return { id: newId(), name: 'Jogador', email: null, isGuest: false };
  }
  async signOut(): Promise<void> {}
  async deleteAccount(): Promise<void> {
    await wait(700);
  }
}

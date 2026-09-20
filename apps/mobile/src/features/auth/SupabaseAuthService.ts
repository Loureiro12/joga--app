import type { AuthError as SupabaseAuthError, SupabaseClient, User } from '@supabase/supabase-js';

import { AuthError, type AuthProvider, type AuthService, type AuthUser } from './AuthService';

/**
 * Partes que dependem de módulos nativos (navegador do sistema, Sign in with Apple).
 * São injetadas para esta classe continuar testável em Node — ver `platformAuth.ts`.
 */
export type PlatformAuth = {
  /** Deep links aceitos em `additional_redirect_urls` do Supabase. */
  redirectTo: (path: 'auth/callback' | 'reset-password') => string;
  /** Abre a URL de OAuth e devolve a URL de retorno (com `?code=`), ou `null` se o usuário fechar. */
  openAuthSession: (url: string, redirectTo: string) => Promise<string | null>;
  /** Sign in with Apple nativo (iOS). `null` quando indisponível → cai no fluxo web. */
  appleNative: null | (() => Promise<{ idToken: string; rawNonce: string; fullName: string | null } | null>);
};

const toUser = (user: User): AuthUser => ({
  id: user.id,
  name: (user.user_metadata?.name as string | undefined) ?? (user.user_metadata?.full_name as string | undefined) ?? (user.is_anonymous ? 'Convidado' : (user.email?.split('@')[0] ?? 'Jogador')),
  email: user.email ?? null,
  isGuest: Boolean(user.is_anonymous),
});

function translate(error: SupabaseAuthError | Error): AuthError {
  const code = 'code' in error ? String(error.code ?? '') : '';
  const status = 'status' in error ? Number(error.status) : 0;
  const message = error.message ?? '';
  if (code === 'invalid_credentials') return new AuthError('invalid_credentials');
  if (code === 'user_already_exists' || code === 'email_exists' || code === 'identity_already_exists') return new AuthError('email_in_use');
  if (code === 'weak_password') return new AuthError('weak_password');
  if (code === 'email_not_confirmed') return new AuthError('confirm_email');
  if (code.startsWith('over_') || status === 429) return new AuthError('rate_limited');
  if (/network|fetch failed|failed to fetch/i.test(message)) return new AuthError('network');
  return new AuthError('unknown', `${code || status} ${message}`.trim());
}

export class SupabaseAuthService implements AuthService {
  readonly managesSession = true;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly platform: PlatformAuth,
  ) {}

  async getCurrentUser(): Promise<AuthUser | null> {
    // getSession lê do storage (rápido, offline); o token é validado na primeira chamada à API.
    const { data } = await this.supabase.auth.getSession();
    return data.session ? toUser(data.session.user) : null;
  }

  onAuthStateChange(listener: (user: AuthUser | null) => void): () => void {
    const { data } = this.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') listener(session ? toUser(session.user) : null);
    });
    return () => data.subscription.unsubscribe();
  }

  async signInWithEmail(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw translate(error);
    return toUser(data.user);
  }

  async signUpWithEmail(name: string, email: string, password: string): Promise<AuthUser> {
    const cleanName = name.trim();
    const cleanEmail = email.trim();

    if (await this.isAnonymous()) {
      // Convidado → conta: mesmo usuário, então histórico e amigos continuam.
      const { data, error } = await this.supabase.auth.updateUser({ email: cleanEmail, password, data: { name: cleanName } });
      if (error) throw translate(error);
      await this.supabase.from('profiles').update({ name: cleanName }).eq('id', data.user.id);
      if (!data.user.email) throw new AuthError('confirm_email');
      return toUser(data.user);
    }

    const { data, error } = await this.supabase.auth.signUp({ email: cleanEmail, password, options: { data: { name: cleanName } } });
    if (error) throw translate(error);
    // Com "confirmar e-mail" ligado, o Supabase devolve usuário sem sessão (e sem identities se o e-mail já existe).
    if (data.user && data.user.identities?.length === 0) throw new AuthError('email_in_use');
    if (!data.session || !data.user) throw new AuthError('confirm_email');
    return toUser(data.user);
  }

  async signInWithProvider(provider: AuthProvider): Promise<AuthUser> {
    if (provider === 'apple' && this.platform.appleNative) {
      const credential = await this.platform.appleNative();
      if (!credential) throw new AuthError('cancelled');
      const { data, error } = await this.supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.idToken, nonce: credential.rawNonce });
      if (error) throw translate(error);
      // A Apple só informa o nome no PRIMEIRO login; aproveita para trocar o nome genérico do perfil.
      if (credential.fullName) {
        await this.supabase.auth.updateUser({ data: { name: credential.fullName } });
        await this.supabase.from('profiles').update({ name: credential.fullName.slice(0, 24) }).eq('id', data.user.id);
        return { ...toUser(data.user), name: credential.fullName };
      }
      return toUser(data.user);
    }

    // Fluxo web (Google nos dois sistemas; Apple no Android), com PKCE.
    const redirectTo = this.platform.redirectTo('auth/callback');
    const options = { redirectTo, skipBrowserRedirect: true };
    const { data, error } = (await this.isAnonymous())
      ? await this.supabase.auth.linkIdentity({ provider, options })
      : await this.supabase.auth.signInWithOAuth({ provider, options });
    if (error) throw translate(error);
    if (!data.url) throw new AuthError('provider_unavailable');

    const returned = await this.platform.openAuthSession(data.url, redirectTo);
    if (!returned) throw new AuthError('cancelled');
    const params = new URL(returned).searchParams;
    if (params.get('error')) throw new AuthError(params.get('error_code') === 'identity_already_exists' ? 'email_in_use' : 'provider_unavailable', params.get('error_description') ?? undefined);
    const code = params.get('code');
    if (!code) throw new AuthError('provider_unavailable', 'retorno sem code');

    const exchanged = await this.supabase.auth.exchangeCodeForSession(code);
    if (exchanged.error) throw translate(exchanged.error);
    return toUser(exchanged.data.user);
  }

  async signInAsGuest(): Promise<AuthUser> {
    // Já é convidado? Reaproveita, para não criar um usuário anônimo novo a cada toque.
    const current = await this.getCurrentUser();
    if (current?.isGuest) return current;
    const { data, error } = await this.supabase.auth.signInAnonymously();
    if (error) throw translate(error);
    if (!data.user) throw new AuthError('unknown', 'signInAnonymously sem usuário');
    return toUser(data.user);
  }

  async sendPasswordReset(email: string): Promise<void> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: this.platform.redirectTo('reset-password') });
    if (error) throw translate(error);
  }

  async completePasswordReset(code: string, newPassword: string): Promise<AuthUser> {
    const exchanged = await this.supabase.auth.exchangeCodeForSession(code);
    if (exchanged.error) throw translate(exchanged.error);
    const { data, error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) throw translate(error);
    return toUser(data.user);
  }

  async signOut(): Promise<void> {
    // scope local: sair neste aparelho não derruba a sessão dos outros.
    const { error } = await this.supabase.auth.signOut({ scope: 'local' });
    if (error) throw translate(error);
  }

  async deleteAccount(): Promise<void> {
    const { error } = await this.supabase.rpc('delete_my_account');
    // 28000 = levantado pela função; 42501 = sem permissão de execução (chamada sem login).
    if (error) throw error.code === '28000' || error.code === '42501' ? new AuthError('not_authenticated') : new AuthError('unknown', error.message);
    // O usuário não existe mais no servidor; limpa só o storage local.
    await this.supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }

  private async isAnonymous(): Promise<boolean> {
    const { data } = await this.supabase.auth.getSession();
    return Boolean(data.session?.user.is_anonymous);
  }
}

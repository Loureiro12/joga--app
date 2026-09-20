/**
 * Lógica do `SupabaseAuthService` com um cliente Supabase falso: qual chamada é feita em cada
 * situação e como os erros viram códigos do app. Roda sem rede (entra no `npm test` e no CI).
 * O comportamento contra o servidor real fica em `supabase.integration.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SupabaseClient } from '@supabase/supabase-js';

import { AuthError } from '../src/features/auth/AuthService';
import { SupabaseAuthService, type PlatformAuth } from '../src/features/auth/SupabaseAuthService';

type Call = [method: string, ...args: unknown[]];

const user = (over: Record<string, unknown> = {}) => ({ id: 'u1', email: 'a@b.co', is_anonymous: false, user_metadata: { name: 'Ana' }, identities: [{}], ...over });

function fake(opts: { session?: ReturnType<typeof user> | null; results?: Record<string, unknown> } = {}) {
  const calls: Call[] = [];
  const result = (name: string, fallback: unknown) => opts.results?.[name] ?? fallback;
  const ok = (u = user()) => ({ data: { user: u, session: { user: u } }, error: null });
  const auth = {
    getSession: async () => ({ data: { session: opts.session ? { user: opts.session } : null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: async (a: unknown) => (calls.push(['signInWithPassword', a]), result('signInWithPassword', ok())),
    signUp: async (a: unknown) => (calls.push(['signUp', a]), result('signUp', ok())),
    updateUser: async (a: unknown) => (calls.push(['updateUser', a]), result('updateUser', ok())),
    signInAnonymously: async () => (calls.push(['signInAnonymously']), result('signInAnonymously', ok(user({ is_anonymous: true, email: undefined, user_metadata: {} })))),
    signInWithOAuth: async (a: unknown) => (calls.push(['signInWithOAuth', a]), result('oauth', { data: { url: 'https://sb/authorize' }, error: null })),
    linkIdentity: async (a: unknown) => (calls.push(['linkIdentity', a]), result('oauth', { data: { url: 'https://sb/authorize' }, error: null })),
    signInWithIdToken: async (a: unknown) => (calls.push(['signInWithIdToken', a]), result('signInWithIdToken', ok())),
    exchangeCodeForSession: async (code: string) => (calls.push(['exchangeCodeForSession', code]), result('exchange', ok())),
    resetPasswordForEmail: async (...a: unknown[]) => (calls.push(['resetPasswordForEmail', ...a]), { error: null }),
    signOut: async (a: unknown) => (calls.push(['signOut', a]), { error: null }),
  };
  const from = (table: string) => ({ update: (patch: unknown) => ({ eq: async (col: string, id: string) => (calls.push(['profiles.update', table, patch, col, id]), { error: null }) }) });
  const rpc = async (fn: string) => (calls.push(['rpc', fn]), result('rpc', { error: null }));
  return { client: { auth, from, rpc } as unknown as SupabaseClient, calls };
}

const platform = (over: Partial<PlatformAuth> = {}): PlatformAuth => ({
  redirectTo: (path) => `jogae://${path}`,
  openAuthSession: async () => 'jogae://auth/callback?code=CODE123',
  appleNative: null,
  ...over,
});

const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (e) {
    assert.ok(e instanceof AuthError, `esperava AuthError, veio ${e}`);
    return e.code;
  }
  assert.fail('deveria ter lançado');
};
const names = (calls: Call[]) => calls.map((c) => c[0]);

test('cadastro comum usa signUp e limpa espaços', async () => {
  const f = fake();
  const u = await new SupabaseAuthService(f.client, platform()).signUpWithEmail('  Ana  ', ' a@b.co ', 'segredo1');
  assert.deepEqual(f.calls[0], ['signUp', { email: 'a@b.co', password: 'segredo1', options: { data: { name: 'Ana' } } }]);
  assert.equal(u.isGuest, false);
});

test('cadastro com sessão de convidado converte o usuário em vez de criar outro', async () => {
  const f = fake({ session: user({ is_anonymous: true }) });
  await new SupabaseAuthService(f.client, platform()).signUpWithEmail('Ana', 'a@b.co', 'segredo1');
  assert.deepEqual(names(f.calls), ['updateUser', 'profiles.update'], 'não pode chamar signUp: perderia o id do convidado');
  assert.deepEqual(f.calls[1].slice(1), ['profiles', { name: 'Ana' }, 'id', 'u1']);
});

test('cadastro: e-mail já usado, confirmação pendente e senha fraca', async () => {
  const svc = (results: Record<string, unknown>) => new SupabaseAuthService(fake({ results }).client, platform());
  assert.equal(await code(svc({ signUp: { data: { user: user({ identities: [] }), session: null }, error: null } }).signUpWithEmail('A', 'a@b.co', 'x')), 'email_in_use');
  assert.equal(await code(svc({ signUp: { data: { user: user(), session: null }, error: null } }).signUpWithEmail('A', 'a@b.co', 'x')), 'confirm_email');
  assert.equal(await code(svc({ signUp: { data: {}, error: { code: 'weak_password', message: '' } } }).signUpWithEmail('A', 'a@b.co', 'x')), 'weak_password');
  assert.equal(await code(svc({ signUp: { data: {}, error: { code: 'user_already_exists', message: '' } } }).signUpWithEmail('A', 'a@b.co', 'x')), 'email_in_use');
});

test('login: tradução de erros do Supabase', async () => {
  const svc = (error: unknown) => new SupabaseAuthService(fake({ results: { signInWithPassword: { data: {}, error } } }).client, platform());
  assert.equal(await code(svc({ code: 'invalid_credentials', message: '' }).signInWithEmail('a', 'b')), 'invalid_credentials');
  assert.equal(await code(svc({ code: 'email_not_confirmed', message: '' }).signInWithEmail('a', 'b')), 'confirm_email');
  assert.equal(await code(svc({ code: 'over_request_rate_limit', status: 429, message: '' }).signInWithEmail('a', 'b')), 'rate_limited');
  assert.equal(await code(svc({ message: 'TypeError: Network request failed' }).signInWithEmail('a', 'b')), 'network');
  assert.equal(await code(svc({ code: 'algo_novo', message: 'x' }).signInWithEmail('a', 'b')), 'unknown');
});

test('convidado: reaproveita a sessão anônima existente', async () => {
  const already = fake({ session: user({ is_anonymous: true, id: 'g1' }) });
  assert.equal((await new SupabaseAuthService(already.client, platform()).signInAsGuest()).id, 'g1');
  assert.deepEqual(already.calls, []);

  const fresh = fake();
  assert.equal((await new SupabaseAuthService(fresh.client, platform()).signInAsGuest()).isGuest, true);
  assert.deepEqual(names(fresh.calls), ['signInAnonymously']);
});

test('Google: abre o navegador com PKCE e troca o code pela sessão', async () => {
  const f = fake();
  let opened: string[] = [];
  const p = platform({ openAuthSession: async (url, redirect) => ((opened = [url, redirect]), 'jogae://auth/callback?code=CODE123') });
  await new SupabaseAuthService(f.client, p).signInWithProvider('google');
  assert.deepEqual(f.calls[0], ['signInWithOAuth', { provider: 'google', options: { redirectTo: 'jogae://auth/callback', skipBrowserRedirect: true } }]);
  assert.deepEqual(opened, ['https://sb/authorize', 'jogae://auth/callback']);
  assert.deepEqual(f.calls[1], ['exchangeCodeForSession', 'CODE123']);
});

test('Google com sessão de convidado vincula a identidade (linkIdentity)', async () => {
  const f = fake({ session: user({ is_anonymous: true }) });
  await new SupabaseAuthService(f.client, platform()).signInWithProvider('google');
  assert.deepEqual(names(f.calls), ['linkIdentity', 'exchangeCodeForSession']);
});

test('OAuth: fechar a janela é "cancelled"; erro no retorno não tenta trocar code', async () => {
  const closed = fake();
  assert.equal(await code(new SupabaseAuthService(closed.client, platform({ openAuthSession: async () => null })).signInWithProvider('google')), 'cancelled');
  assert.deepEqual(names(closed.calls), ['signInWithOAuth']);

  const denied = fake();
  const p = platform({ openAuthSession: async () => 'jogae://auth/callback?error=access_denied&error_description=nope' });
  assert.equal(await code(new SupabaseAuthService(denied.client, p).signInWithProvider('google')), 'provider_unavailable');
  assert.ok(!names(denied.calls).includes('exchangeCodeForSession'));

  const linked = platform({ openAuthSession: async () => 'jogae://auth/callback?error=x&error_code=identity_already_exists' });
  assert.equal(await code(new SupabaseAuthService(fake().client, linked).signInWithProvider('google')), 'email_in_use');
});

test('Apple nativo: manda o nonce cru ao Supabase e grava o nome do primeiro login', async () => {
  const f = fake();
  const p = platform({ appleNative: async () => ({ idToken: 'TOKEN', rawNonce: 'RAW', fullName: 'Ana Souza' }) });
  const u = await new SupabaseAuthService(f.client, p).signInWithProvider('apple');
  assert.deepEqual(f.calls[0], ['signInWithIdToken', { provider: 'apple', token: 'TOKEN', nonce: 'RAW' }]);
  assert.deepEqual(names(f.calls), ['signInWithIdToken', 'updateUser', 'profiles.update']);
  assert.equal(u.name, 'Ana Souza');

  const returning = fake();
  const p2 = platform({ appleNative: async () => ({ idToken: 'T', rawNonce: 'R', fullName: null }) });
  await new SupabaseAuthService(returning.client, p2).signInWithProvider('apple');
  assert.deepEqual(names(returning.calls), ['signInWithIdToken'], 'sem nome (logins seguintes) não sobrescreve o perfil');

  const cancelled = platform({ appleNative: async () => null });
  assert.equal(await code(new SupabaseAuthService(fake().client, cancelled).signInWithProvider('apple')), 'cancelled');
});

test('Apple sem módulo nativo (Android) cai no fluxo web', async () => {
  const f = fake();
  await new SupabaseAuthService(f.client, platform({ appleNative: null })).signInWithProvider('apple');
  assert.equal(f.calls[0][0], 'signInWithOAuth');
});

test('redefinir senha: pede o link com o deep link certo e conclui com code + senha nova', async () => {
  const f = fake();
  const svc = new SupabaseAuthService(f.client, platform());
  await svc.sendPasswordReset(' a@b.co ');
  assert.deepEqual(f.calls[0], ['resetPasswordForEmail', 'a@b.co', { redirectTo: 'jogae://reset-password' }]);
  await svc.completePasswordReset('C0DE', 'nova-senha');
  assert.deepEqual(f.calls.slice(1), [['exchangeCodeForSession', 'C0DE'], ['updateUser', { password: 'nova-senha' }]]);

  const expired = fake({ results: { exchange: { data: {}, error: { code: 'flow_state_expired', message: 'x' } } } });
  assert.equal(await code(new SupabaseAuthService(expired.client, platform()).completePasswordReset('C', 'p')), 'unknown');
  assert.ok(!names(expired.calls).includes('updateUser'), 'code inválido não pode chegar a trocar a senha');
});

test('sair é local; excluir conta chama a RPC e só então limpa a sessão', async () => {
  const out = fake();
  await new SupabaseAuthService(out.client, platform()).signOut();
  assert.deepEqual(out.calls, [['signOut', { scope: 'local' }]]);

  const del = fake();
  await new SupabaseAuthService(del.client, platform()).deleteAccount();
  assert.deepEqual(del.calls, [['rpc', 'delete_my_account'], ['signOut', { scope: 'local' }]]);

  for (const pg of ['28000', '42501']) {
    const denied = fake({ results: { rpc: { error: { code: pg, message: 'x' } } } });
    assert.equal(await code(new SupabaseAuthService(denied.client, platform()).deleteAccount()), 'not_authenticated');
    assert.deepEqual(names(denied.calls), ['rpc'], 'se a exclusão falhou, a sessão continua');
  }
});

/**
 * Testes de integração do passo 2 (conta e perfil) contra o Supabase LOCAL.
 * Exercitam as classes reais do app (`SupabaseAuthService`, `SupabaseProfileService`),
 * então cobrem de uma vez: migrations, trigger de perfil, RLS, RPC de exclusão e o código cliente.
 *
 *   npm run db:start && npm run test:db      (da raiz)
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { before, test } from 'node:test';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

import { AuthError } from '../src/features/auth/AuthService';
import { SupabaseAuthService, type PlatformAuth } from '../src/features/auth/SupabaseAuthService';
import { SupabaseHistoryService } from '../src/features/history/SupabaseHistoryService';
import { ProfileError } from '../src/features/profile/ProfileService';
import { SupabaseProfileService } from '../src/features/profile/SupabaseProfileService';

type Stack = { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string; INBUCKET_URL?: string; MAILPIT_URL?: string };

const stack: Stack = JSON.parse(execSync('npx supabase status -o json', { cwd: new URL('../../..', import.meta.url), stdio: ['ignore', 'pipe', 'ignore'] }).toString());
const mailUrl = stack.MAILPIT_URL ?? stack.INBUCKET_URL ?? 'http://127.0.0.1:54324';

// Node 20 não tem WebSocket nativo, e o supabase-js exige um para montar o cliente (realtime).
const realtime = { transport: WebSocket as never };

const platform: PlatformAuth = {
  redirectTo: (path) => `jogae://${path}`,
  openAuthSession: async () => null,
  appleNative: null,
};

/** Um "aparelho": cliente próprio, com sessão própria em memória. */
function device() {
  const supabase = createClient(stack.API_URL, stack.ANON_KEY, { realtime, auth: { flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: false } });
  return { supabase, auth: new SupabaseAuthService(supabase, platform), profile: new SupabaseProfileService(supabase), history: new SupabaseHistoryService(supabase) };
}

const admin: SupabaseClient = createClient(stack.API_URL, stack.SERVICE_ROLE_KEY, { realtime, auth: { persistSession: false, autoRefreshToken: false } });

const run = Date.now().toString(36);
let n = 0;
const email = (tag: string) => `${tag}.${run}.${n++}@teste.jogaeapp.com.br`;
const PASS = 'senha-segura-123';

const rejectsWith = async (promise: Promise<unknown>, Type: typeof AuthError | typeof ProfileError, code: string) => {
  await assert.rejects(promise, (e: unknown) => {
    assert.ok(e instanceof Type, `esperava ${Type.name}, veio ${e}`);
    assert.equal((e as { code: string }).code, code);
    return true;
  });
};

before(async () => {
  const { error } = await admin.from('profiles').select('id').limit(1);
  assert.equal(error, null, `Supabase local fora do ar ou migrations não aplicadas: ${error?.message}`);
});

test('convidado: vira usuário anônimo com perfil criado pelo trigger', async () => {
  const d = device();
  const guest = await d.auth.signInAsGuest();
  assert.equal(guest.isGuest, true);
  assert.equal(guest.email, null);

  const profile = await d.profile.getMyProfile(guest.id);
  assert.equal(profile?.name, 'Convidado');
  assert.match(profile!.username, /^convidado_\d{4}$/);

  const again = await d.auth.signInAsGuest();
  assert.equal(again.id, guest.id, 'tocar de novo em "convidado" não pode criar outro usuário');
});

test('cadastro: perfil nasce com o nome informado e username derivado dele', async () => {
  const d = device();
  const user = await d.auth.signUpWithEmail('  João Vítor  ', email('joao'), PASS);
  assert.equal(user.isGuest, false);
  assert.equal(user.name, 'João Vítor');

  const profile = await d.profile.getMyProfile(user.id);
  assert.equal(profile?.name, 'João Vítor');
  assert.match(profile!.username, /^joaovitor(_\d{4})?$/);
  assert.match(profile!.color, /^#[0-9A-F]{6}$/);
});

test('dois usuários com o mesmo nome recebem usernames diferentes', async () => {
  const name = `Gêmeo ${run}`;
  const a = device();
  const b = device();
  const ua = await a.auth.signUpWithEmail(name, email('g1'), PASS);
  const ub = await b.auth.signUpWithEmail(name, email('g2'), PASS);
  const pa = await a.profile.getMyProfile(ua.id);
  const pb = await b.profile.getMyProfile(ub.id);
  assert.notEqual(pa!.username, pb!.username);
  assert.match(pb!.username, /_\d{4}$/);
});

test('erros de login são traduzidos para os códigos do app', async () => {
  const d = device();
  const address = email('erros');
  await d.auth.signUpWithEmail('Erros', address, PASS);
  await d.auth.signOut();

  await rejectsWith(d.auth.signInWithEmail(address, 'senha-errada'), AuthError, 'invalid_credentials');
  await rejectsWith(d.auth.signInWithEmail(email('nao-existe'), PASS), AuthError, 'invalid_credentials');
  await rejectsWith(device().auth.signUpWithEmail('Outro', address, PASS), AuthError, 'email_in_use');

  const back = await d.auth.signInWithEmail(address, PASS);
  assert.equal(back.email, address);
  assert.equal((await d.auth.getCurrentUser())?.id, back.id);
});

test('RLS: leio o perfil dos outros, mas só edito o meu', async () => {
  const a = device();
  const b = device();
  const ua = await a.auth.signUpWithEmail('Alice Rls', email('alice'), PASS);
  const ub = await b.auth.signUpWithEmail('Bruno Rls', email('bruno'), PASS);

  assert.equal((await a.profile.getMyProfile(ub.id))?.name, 'Bruno Rls', 'perfil alheio é público para logados');

  const hijack = await a.profile.updateMyProfile(ub.id, { name: 'Hackeado' });
  assert.equal(hijack, null, 'update no perfil alheio não afeta nenhuma linha');
  assert.equal((await b.profile.getMyProfile(ub.id))?.name, 'Bruno Rls');

  const mine = await a.profile.updateMyProfile(ua.id, { name: 'Alice Nova', color: '#22C55E' });
  assert.deepEqual({ name: mine?.name, color: mine?.color }, { name: 'Alice Nova', color: '#22C55E' });

  const loggedOut = createClient(stack.API_URL, stack.ANON_KEY, { realtime, auth: { persistSession: false } });
  const { data } = await loggedOut.from('profiles').select('id');
  assert.deepEqual(data ?? [], [], 'quem não está logado não lê perfil nenhum');
});

test('RLS: a API não consegue inserir, apagar, nem mexer em colunas de sistema', async () => {
  const d = device();
  const user = await d.auth.signUpWithEmail('Colunas', email('colunas'), PASS);
  const insert = await d.supabase.from('profiles').insert({ id: crypto.randomUUID(), name: 'Fantasma', username: `fantasma_${run}` });
  assert.ok(insert.error, 'insert direto deve ser negado');
  const del = await d.supabase.from('profiles').delete().eq('id', user.id);
  assert.ok(del.error, 'delete direto deve ser negado');
  const sys = await d.supabase.from('profiles').update({ created_at: '2000-01-01' }).eq('id', user.id);
  assert.ok(sys.error, 'created_at não é editável');
});

test('username: formato, reservados e unicidade são garantidos pelo banco', async () => {
  const a = device();
  const b = device();
  const ua = await a.auth.signUpWithEmail('Dono', email('dono'), PASS);
  const ub = await b.auth.signUpWithEmail('Copiao', email('copiao'), PASS);
  const wanted = `dono_${run}`.slice(0, 20);

  assert.equal(await a.profile.checkUsername(wanted, ua.id), 'available');
  await a.profile.updateMyProfile(ua.id, { username: wanted });

  assert.equal(await b.profile.checkUsername(wanted, ub.id), 'taken');
  assert.equal(await a.profile.checkUsername(wanted, ua.id), 'available', 'o próprio username não conta como em uso');
  assert.equal(await b.profile.checkUsername('ab', ub.id), 'too_short');

  await rejectsWith(b.profile.updateMyProfile(ub.id, { username: wanted }), ProfileError, 'username_taken');
  await rejectsWith(b.profile.updateMyProfile(ub.id, { username: wanted.toUpperCase() }), ProfileError, 'invalid');
  await rejectsWith(b.profile.updateMyProfile(ub.id, { username: 'com espaço' }), ProfileError, 'invalid');
  await rejectsWith(b.profile.updateMyProfile(ub.id, { username: 'admin' }), ProfileError, 'invalid');
  await rejectsWith(b.profile.updateMyProfile(ub.id, { color: '#123456' }), ProfileError, 'invalid');
  await rejectsWith(b.profile.updateMyProfile(ub.id, { name: 'A' }), ProfileError, 'invalid');
});

test('convidado → conta: mesmo id, mesmo perfil, e a senha passa a funcionar', async () => {
  const d = device();
  const guest = await d.auth.signInAsGuest();
  await d.profile.updateMyProfile(guest.id, { color: '#EF4444' });
  const address = email('upgrade');

  const account = await d.auth.signUpWithEmail('Ex Convidado', address, PASS);
  assert.equal(account.id, guest.id, 'a conversão tem que manter o id (histórico e amigos dependem dele)');
  assert.equal(account.isGuest, false);

  const profile = await d.profile.getMyProfile(account.id);
  assert.equal(profile?.name, 'Ex Convidado');
  assert.equal(profile?.color, '#EF4444', 'o que o convidado já tinha configurado continua');

  await d.auth.signOut();
  assert.equal((await device().auth.signInWithEmail(address, PASS)).id, guest.id);
});

test('redefinir senha: e-mail chega, o link devolve um code e a senha nova vale', async () => {
  const d = device();
  const address = email('reset');
  const user = await d.auth.signUpWithEmail('Esquecido', address, PASS);
  await d.auth.signOut();

  await d.auth.sendPasswordReset(address);

  // Caixa de e-mail de teste do Supabase local (Mailpit).
  let link: string | undefined;
  for (let i = 0; i < 20 && !link; i++) {
    const list = await (await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const message = await (await fetch(`${mailUrl}/api/v1/message/${id}`)).json();
      link = String(message.HTML ?? message.Text).match(/https?:\/\/[^"\s<]+verify[^"\s<]+/)?.[0]?.replace(/&amp;/g, '&');
    }
    if (!link) await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(link, 'o e-mail de redefinição não chegou');

  const redirect = await fetch(link, { redirect: 'manual' });
  const location = redirect.headers.get('location') ?? '';
  assert.match(location, /^jogae:\/\/reset-password\?code=/, `redirect inesperado: ${location}`);
  const code = new URL(location).searchParams.get('code')!;

  const restored = await d.auth.completePasswordReset(code, 'senha-nova-456');
  assert.equal(restored.id, user.id);

  await d.auth.signOut();
  await rejectsWith(d.auth.signInWithEmail(address, PASS), AuthError, 'invalid_credentials');
  assert.equal((await d.auth.signInWithEmail(address, 'senha-nova-456')).id, user.id);
});

test('excluir conta: usuário e perfil somem, o login para de funcionar e só apaga a própria conta', async () => {
  const victim = device();
  const bystander = device();
  const address = email('excluir');
  const user = await victim.auth.signUpWithEmail('Vai Sumir', address, PASS);
  const other = await bystander.auth.signUpWithEmail('Fica', email('fica'), PASS);

  let signedOut = false;
  victim.auth.onAuthStateChange((u) => (signedOut = u === null));

  await victim.auth.deleteAccount();

  const { data: profiles } = await admin.from('profiles').select('id').in('id', [user.id, other.id]);
  assert.deepEqual(profiles?.map((p) => p.id), [other.id], 'só o perfil de quem pediu é apagado');
  const { data: gone } = await admin.auth.admin.getUserById(user.id);
  assert.equal(gone.user, null, 'o usuário saiu do Auth');

  assert.equal(await victim.auth.getCurrentUser(), null);
  assert.equal(signedOut, true, 'o app é avisado para voltar ao login');
  await rejectsWith(device().auth.signInWithEmail(address, PASS), AuthError, 'invalid_credentials');
});

test('excluir conta sem estar logado é recusado', async () => {
  await rejectsWith(device().auth.deleteAccount(), AuthError, 'not_authenticated');
});

test('histórico: só o servidor grava; cada jogador lê a própria linha; regravar não duplica; conquistas saem do histórico', async () => {
  const [a, b, outsider] = [device(), device(), device()];
  const ua = await a.auth.signUpWithEmail('Hist Ana', email('hana'), PASS);
  const ub = await b.auth.signUpWithEmail('Hist Bia', email('hbia'), PASS);
  await outsider.auth.signUpWithEmail('De Fora', email('hfora'), PASS);

  const record = (matchId: string, anaWon: boolean) => ({
    matchId,
    roomCode: '4827',
    gameId: 'impostor',
    category: 'Filmes',
    totalRounds: 3,
    impostorsCaught: 2,
    startedAt: Date.now() - 600_000,
    endedAt: Date.now(),
    players: [
      { playerId: ua.id, name: 'Hist Ana', color: '#7C3AED', position: anaWon ? 1 : 2, points: anaWon ? 900 : 300, won: anaWon, timesImpostor: 1, timesEscaped: 1 },
      { playerId: ub.id, name: 'Hist Bia', color: '#FACC15', position: anaWon ? 2 : 1, points: anaWon ? 300 : 900, won: !anaWon, timesImpostor: 0, timesEscaped: 0 },
      { playerId: 'dev-bot-1', name: 'Bot', color: '#22C55E', position: 3, points: 0, won: false, timesImpostor: 0, timesEscaped: 0 },
    ],
  });

  const forged = await a.supabase.rpc('record_match', { record: record(crypto.randomUUID(), true) });
  assert.equal(forged.error?.code, '42501', 'usuário comum não pode gravar partida');

  const first = crypto.randomUUID();
  assert.equal((await admin.rpc('record_match', { record: record(first, true) })).data, true);
  assert.equal((await admin.rpc('record_match', { record: record(first, true) })).data, false, 'mesma partida de novo: não duplica');

  const mine = await a.history.list();
  assert.equal(mine.length, 1);
  assert.deepEqual([mine[0].gameId, mine[0].wordCategory, mine[0].players, mine[0].position, mine[0].points, mine[0].won], ['impostor', 'Filmes', 3, 1, 900, true]);
  assert.deepEqual([(await b.history.list())[0].position, (await b.history.list())[0].won], [2, false]);
  assert.deepEqual(await outsider.history.list(), [], 'quem não jogou não vê a partida');
  const { data: rows } = await a.supabase.from('match_players').select('name');
  assert.deepEqual(rows?.map((r) => r.name), ['Hist Ana'], 'do boletim, só a minha linha');

  for (let i = 0; i < 4; i++) await admin.rpc('record_match', { record: record(crypto.randomUUID(), true) });
  assert.deepEqual(await a.history.stats(), { matches: 5, wins: 5, favoriteGameId: 'impostor' });
  assert.deepEqual((await a.history.achievements()).sort(), ['king_of_the_group', 'master_of_disguise']);
  assert.deepEqual(await b.history.achievements(), []);
  assert.deepEqual(await outsider.history.stats(), { matches: 0, wins: 0, favoriteGameId: null });

  await a.auth.deleteAccount();
  assert.equal((await b.history.list()).length, 5, 'a Bia continua com o histórico depois que a Ana excluiu a conta');
});

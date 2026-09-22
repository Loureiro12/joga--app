/**
 * SupabaseSocialService contra um cliente falso: o que interessa aqui é a tradução
 * (linhas do banco → Friend; mensagens de erro das funções → códigos do app).
 * As regras de verdade (amizade mútua, privacidade da sala) são testadas no banco: supabase.integration.test.ts.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SupabaseClient } from '@supabase/supabase-js';

import { SocialError } from '../src/features/social/SocialService';
import { SupabaseSocialService } from '../src/features/social/SupabaseSocialService';

type Result = { data: unknown; error: { message: string; code?: string } | null };

function fake(results: Record<string, Result>) {
  const calls: [string, unknown][] = [];
  const rpc = (fn: string, args?: unknown) => {
    calls.push([fn, args]);
    const result = results[fn] ?? { data: null, error: null };
    // `rpc()` é "thenable" e também tem `.maybeSingle()`, como no supabase-js.
    const single = { ...result, data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data };
    return Object.assign(Promise.resolve(result), { maybeSingle: async () => single });
  };
  const service = new SupabaseSocialService({ rpc } as unknown as SupabaseClient, (username) => `site/u/${username}`);
  return { service, calls };
}

const row = (over: Record<string, unknown> = {}) => ({ id: 'u2', name: 'Bia', username: 'bia', color: '#7C3AED', games_together: 3, trophies: 1, playing_game: null, playing_code: null, playing_status: null, ...over });

test('lista: converte as linhas e só oferece "Entrar" para sala ainda no lobby', async () => {
  const { service } = fake({
    get_my_friends: { data: [row({ playing_game: 'impostor', playing_code: '4827', playing_status: 'open' }), row({ id: 'u3', playing_game: 'impostor', playing_code: '9130', playing_status: 'playing' }), row({ id: 'u4' })], error: null },
  });
  const [lobby, midMatch, idle] = await service.listFriends();
  assert.deepEqual(lobby, { id: 'u2', name: 'Bia', username: 'bia', color: '#7C3AED', gamesTogether: 3, trophies: 1, playing: { gameId: 'impostor', roomCode: '4827', joinable: true } });
  assert.deepEqual(midMatch.playing, { gameId: 'impostor', roomCode: '9130', joinable: false });
  assert.equal(idle.playing, undefined);
});

test('lista vazia e falha de leitura', async () => {
  assert.deepEqual(await fake({ get_my_friends: { data: null, error: null } }).service.listFriends(), []);
  await assert.rejects(fake({ get_my_friends: { data: null, error: { message: 'fetch failed' } } }).service.listFriends(), (e) => e instanceof SocialError && e.code === 'unknown');
});

test('adicionar: manda o @username como veio e traduz os erros do banco', async () => {
  const ok = fake({ add_friend_by_username: { data: [{ id: 'u2', name: 'Bia', username: 'bia', already_friends: false }], error: null } });
  assert.deepEqual(await ok.service.addFriend('@Bia'), { id: 'u2', name: 'Bia', username: 'bia', alreadyFriends: false });
  assert.deepEqual(ok.calls, [['add_friend_by_username', { target_username: '@Bia' }]]);

  for (const [message, code] of [['friend_not_found', 'not_found'], ['friend_is_self', 'self'], ['friend_rate_limited', 'rate_limited'], ['outra coisa', 'unknown']] as const) {
    const failing = fake({ add_friend_by_username: { data: null, error: { message, code: 'P0001' } } });
    await assert.rejects(failing.service.addFriend('x'), (e) => e instanceof SocialError && e.code === code, message);
  }
});

test('remover chama a função do banco; o link de convite vem de fora', async () => {
  const { service, calls } = fake({});
  await service.removeFriend('u2');
  assert.deepEqual(calls, [['remove_friend', { friend_id: 'u2' }]]);
  assert.equal(service.inviteLink('bia'), 'site/u/bia');
});

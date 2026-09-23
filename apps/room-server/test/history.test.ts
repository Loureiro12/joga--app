import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { MatchRecord } from '@jogae/engine';

import { loadConfig } from '../src/config';
import { SupabaseMatchRecorder, type MatchRecorder } from '../src/rooms/MatchRecorder';
import { INPUT, roomWith, sleep, startServer, type TestClient , type ImpostorView } from './helpers';

class SpyRecorder implements MatchRecorder {
  readonly records: MatchRecord[] = [];
  async record(match: MatchRecord) {
    this.records.push(match);
  }
}

/** Joga uma partida de 2 rodadas até o fim; o grupo sempre vota no impostor. */
async function playToTheEnd(clients: TestClient[], host: TestClient) {
  await host.cmd({ type: 'startMatch' });
  for (let round = 1; round <= INPUT.totalRounds; round++) {
    await Promise.all(clients.map((c) => c.untilSnapshot((s) => s.room.phase === 'role_reveal' && s.room.roundIndex === round, `papel ${round}`)));
    for (const c of clients) await c.cmd({ type: 'ackRole' });
    await host.untilSnapshot((s) => s.room.phase === 'clues', 'pistas');
    await host.cmd({ type: 'openVoting' });
    await Promise.all(clients.map((c) => c.untilSnapshot((s) => s.room.phase === 'voting', 'votação')));
    const impostor = clients.find((c) => c.game.secret!.role === 'impostor')!;
    const innocent = clients.find((c) => c !== impostor)!;
    for (const c of clients) await c.cmd({ type: 'castVote', targetId: c === impostor ? innocent.id : impostor.id });
    await host.untilSnapshot((s) => (s.game as ImpostorView).result?.stage === 2, 'desfecho');
    await host.cmd({ type: 'nextRound' });
  }
  await Promise.all(clients.map((c) => c.untilSnapshot((s) => s.room.phase === 'finished', 'fim')));
}

test('partida que termina gera exatamente um boletim, com quem estava na sala no fim', async () => {
  const recorder = new SpyRecorder();
  const server = await startServer({}, { recorder });
  try {
    const { clients, host, guests } = await roomWith(server.url, ['ana', 'bia', 'caio', 'duda']);
    await playToTheEnd(clients, host);
    // Snapshots seguintes (alguém saindo da tela final) não podem regravar a mesma partida.
    await guests[2].ok({ t: 'leave' });
    await sleep(30);

    assert.equal(recorder.records.length, 1);
    const [record] = recorder.records;
    assert.deepEqual([record.gameId, record.category, record.totalRounds, record.impostorsCaught], ['impostor', 'Comidas', 2, 2]);
    assert.deepEqual(record.players.map((p) => p.playerId).sort(), clients.map((c) => c.id).sort());
    assert.equal(record.players.reduce((n, p) => n + p.timesImpostor, 0), 2);
    assert.ok(record.players.every((p) => p.timesEscaped === 0), 'o grupo acertou sempre');
    assert.ok(record.players.some((p) => p.won));

    await host.cmd({ type: 'playAgain' });
    await playToTheEnd([host, guests[0], guests[1]], host);
    assert.equal(recorder.records.length, 2, '"jogar novamente" é outra partida, com outro id');
    assert.notEqual(recorder.records[1].matchId, record.matchId);
    assert.equal(recorder.records[1].players.length, 3);
  } finally {
    await server.close();
  }
});

test('partida abandonada (fechou por falta de gente) não entra no histórico', async () => {
  const recorder = new SpyRecorder();
  const server = await startServer({}, { recorder });
  try {
    const { host, guests } = await roomWith(server.url, ['ana', 'bia', 'caio']);
    await host.cmd({ type: 'startMatch' });
    await guests[1].ok({ t: 'leave' });
    await host.untilSnapshot((s) => s.room.phase === 'closed', 'sala fechada');
    await sleep(30);
    assert.equal(recorder.records.length, 0);
  } finally {
    await server.close();
  }
});

test('gravador do Supabase: usa a service role, repete em falha transitória e não insiste em erro nosso', async () => {
  const match = { matchId: 'm1', players: [] } as unknown as MatchRecord;
  const logs: string[] = [];
  const log = (event: string) => logs.push(event);
  const calls: { url: string; headers: Headers; body: unknown }[] = [];
  const fetchWith = (statuses: (number | Error)[]) =>
    (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
      const next = statuses.shift();
      if (next instanceof Error) throw next;
      return new Response(JSON.stringify(true), { status: next });
    }) as typeof fetch;

  await new SupabaseMatchRecorder('https://x.supabase.co', 'SEGREDO', log, fetchWith([500, new Error('rede'), 200]), [1, 1, 1]).record(match);
  assert.equal(calls.length, 3, 'duas falhas transitórias, depois sucesso');
  assert.equal(calls[0].url, 'https://x.supabase.co/rest/v1/rpc/record_match');
  assert.deepEqual([calls[0].headers.get('apikey'), calls[0].headers.get('authorization')], ['SEGREDO', 'Bearer SEGREDO']);
  assert.deepEqual(calls[0].body, { record: match });
  assert.deepEqual(logs, ['match_recorded']);

  calls.length = 0;
  await new SupabaseMatchRecorder('https://x.supabase.co', 'SEGREDO', log, fetchWith([403, 200]), [1, 1]).record(match);
  assert.equal(calls.length, 1, '4xx não adianta repetir');
  assert.equal(logs.at(-1), 'match_record_rejected');

  calls.length = 0;
  await new SupabaseMatchRecorder('https://x.supabase.co', 'SEGREDO', log, fetchWith([500, 500, 500]), [1, 1]).record(match);
  assert.equal(calls.length, 3, 'desiste depois das tentativas, sem lançar');
  assert.equal(logs.at(-1), 'match_record_failed');
});

test('config: a chave secreta é opcional e nunca vira parte do modo de autenticação', () => {
  const base = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'pub' };
  assert.equal(loadConfig(base).supabaseServiceRoleKey, null);
  assert.equal(loadConfig({ ...base, SUPABASE_SERVICE_ROLE_KEY: 'sec' }).supabaseServiceRoleKey, 'sec');
});

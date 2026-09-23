import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createTokenVerifier } from '../src/auth';
import { loadConfig } from '../src/config';
import { parseClientMessage } from '../src/messages';
import { FAST, INPUT, ME, TestClient, roomWith, sleep, startServer , type ImpostorView } from './helpers';

test('config: valida ambiente e proíbe token de dev em produção', () => {
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT inválida/);
  assert.throws(() => loadConfig({ NODE_ENV: 'staging' }), /NODE_ENV inválido/);
  assert.throws(() => loadConfig({ AUTH_MODE: 'supabase' }), /exige SUPABASE_URL/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', AUTH_MODE: 'dev' }), /produção/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', AUTH_MODE: 'supabase+dev', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' }), /produção/);
  assert.equal(loadConfig({ SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_ANON_KEY: 'k' }).authMode, 'supabase');
  assert.equal(loadConfig({}).authMode, 'dev');
});

test('auth: confere o token no Supabase e só aceita token de dev quando o modo permite', async () => {
  const calls: { url: string; auth: string | null; apikey: string | null }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    calls.push({ url, auth: headers.get('authorization'), apikey: headers.get('apikey') });
    return headers.get('authorization') === 'Bearer bom' ? Response.json({ id: 'user-123' }) : new Response('{}', { status: 401 });
  }) as typeof fetch;
  const supa = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'pub' };

  const strict = createTokenVerifier(loadConfig({ ...supa, AUTH_MODE: 'supabase' }), fakeFetch);
  assert.equal(await strict('bom'), 'user-123');
  assert.deepEqual(calls[0], { url: 'https://x.supabase.co/auth/v1/user', auth: 'Bearer bom', apikey: 'pub' });
  assert.equal(await strict('ruim'), null);
  assert.equal(await strict('dev:ana'), null, 'modo supabase não pode aceitar token de dev');

  const mixed = createTokenVerifier(loadConfig({ ...supa, AUTH_MODE: 'supabase+dev' }), fakeFetch);
  assert.equal(await mixed('dev:ana'), 'dev-ana', 'id de dev é prefixado: nunca colide com um uuid real');
  assert.equal(await mixed('bom'), 'user-123');

  const offline = createTokenVerifier(loadConfig({ ...supa, AUTH_MODE: 'supabase' }), (async () => Promise.reject(new Error('sem rede'))) as typeof fetch);
  assert.equal(await offline('bom'), null);
});

test('mensagens: entrada malformada ou fora dos limites é rejeitada', () => {
  const ok = (m: unknown) => parseClientMessage(JSON.stringify(m)) !== null;
  assert.ok(ok({ t: 'create', id: 1, input: INPUT, me: ME }));
  assert.ok(!ok({ t: 'create', id: 1, input: { ...INPUT, maxPlayers: 99 }, me: ME }));
  assert.ok(!ok({ t: 'create', id: 1, input: { ...INPUT, gameId: 'outro' }, me: ME }));
  assert.ok(!ok({ t: 'create', id: 1, input: INPUT, me: { name: 'x', color: 'red' } }));
  assert.ok(!ok({ t: 'create', id: 1, input: INPUT, me: { name: '   ', color: ME.color } }));
  assert.ok(!ok({ t: 'join', id: 1, code: '12345', me: ME }));
  assert.ok(!ok({ t: 'join', id: 1, code: "1' or", me: ME }));
  assert.ok(!ok({ t: 'cmd', id: 1, cmd: { type: 'darPontos', points: 9999 } }));
  assert.ok(!ok({ t: 'cmd', id: -1, cmd: { type: 'ackRole' } }));
  assert.ok(!ok({ t: 'hello', v: 999, token: 'x' }));
  assert.equal(parseClientMessage('não é json'), null);
  assert.equal(parseClientMessage('[1,2]'), null);
  const long = parseClientMessage(JSON.stringify({ t: 'create', id: 1, input: INPUT, me: { name: 'N'.repeat(200), color: ME.color } }));
  assert.equal(long?.t === 'create' && long.me.name.length, 24, 'nome é cortado em 24');
});

test('healthz responde com contadores', async () => {
  const server = await startServer();
  try {
    const { clients } = await roomWith(server.url, ['h1', 'h2']);
    const body = (await (await fetch(`${server.base}/healthz`)).json()) as Record<string, unknown>;
    assert.deepEqual([body.status, body.protocol, body.rooms, body.connections], ['ok', 1, 1, 2]);
    assert.equal((await fetch(`${server.base}/nope`)).status, 404);
    clients.forEach((c) => c.close());
  } finally {
    await server.close();
  }
});

test('handshake: sem hello, com token ruim ou falando antes da hora a conexão é fechada', async () => {
  const server = await startServer();
  try {
    const silent = await TestClient.open(server.url, 'mudo', { hello: false });
    await silent.until(() => silent.closed !== null, 'fechar por falta de hello');
    assert.equal(silent.closed!.code, 4401);

    const bad = await TestClient.open(server.url, 'ruim', { token: 'qualquer-coisa' });
    await bad.until(() => bad.closed !== null, 'fechar por token ruim');
    assert.deepEqual([bad.closed!.code, bad.messages.at(-1)], [4401, { t: 'bye', reason: 'unauthenticated' }]);

    const eager = await TestClient.open(server.url, 'apressado', { hello: false });
    eager.raw({ t: 'create', id: 1, input: INPUT, me: ME });
    await eager.until(() => eager.closed !== null, 'fechar por falar antes do hello');
    assert.equal(eager.closed!.code, 4401);

    const garbage = await TestClient.open(server.url, 'lixo');
    garbage.raw('{{{{');
    await garbage.until(() => garbage.closed !== null, 'fechar por lixo');
    assert.equal(garbage.closed!.code, 4400);
  } finally {
    await server.close();
  }
});

test('partida pelo fio: 4 celulares, cada um só recebe o próprio segredo, e o desfecho só sai no fim', async () => {
  const server = await startServer();
  try {
    const { clients, host, guests } = await roomWith(server.url, ['ana', 'bia', 'caio', 'duda']);
    assert.equal((await guests[0].request({ t: 'cmd', cmd: { type: 'startMatch' } }) as { error?: string }).error, 'not_host');
    await host.cmd({ type: 'startMatch' });
    await Promise.all(clients.map((c) => c.untilSnapshot((s) => s.room.phase === 'role_reveal', 'papel')));

    const impostor = clients.filter((c) => c.game.secret!.role === 'impostor');
    assert.equal(impostor.length, 1);
    const innocents = clients.filter((c) => c !== impostor[0]);
    const word = (innocents[0].game.secret as { word: string }).word;
    assert.ok(innocents.every((c) => (c.game.secret as { word: string }).word === word));
    assert.ok(!impostor[0].frames.join('').includes(word), 'a palavra nunca passou pelo fio do impostor');

    for (const c of clients) await c.cmd({ type: 'ackRole' });
    await host.untilSnapshot((s) => s.room.phase === 'clues', 'pistas');
    await host.cmd({ type: 'setTimerRunning', running: true });
    await host.cmd({ type: 'openVoting' });
    await Promise.all(clients.map((c) => c.untilSnapshot((s) => s.room.phase === 'voting', 'votação')));

    const framesBeforeVerdict = clients.map((c) => c.frames.length);
    for (const c of clients) await c.cmd({ type: 'castVote', targetId: c === impostor[0] ? innocents[0].id : impostor[0].id });
    await Promise.all(clients.map((c) => c.untilSnapshot((s) => (s.game as ImpostorView).result?.stage === 2, 'desfecho')));

    clients.forEach((c, i) => {
      const early = c.frames.slice(framesBeforeVerdict[i], -1).join('');
      if (c !== impostor[0]) assert.ok(!early.includes(`"impostorId":"${impostor[0].id}"`), `${c.name} soube do impostor antes da hora`);
      assert.ok(!early.includes(`"${impostor[0].id}":"`), 'nenhum voto individual passou pelo fio');
    });
    const stages = host.messages.flatMap((m) => (m.t === 'snapshot' && (m.snapshot?.game as ImpostorView | undefined)?.result ? [(m.snapshot!.game as ImpostorView).result!.stage] : []));
    assert.deepEqual([...new Set(stages)], [0, 1, 2], 'os três tempos chegaram, em ordem');
    assert.equal(host.game.result!.caught, true);
    assert.equal(host.game.result!.word, word);

    await host.cmd({ type: 'nextRound' });
    await guests[2].untilSnapshot((s) => s.room.roundIndex === 2 && s.room.phase === 'role_reveal', 'rodada 2');
    clients.forEach((c) => c.close());
  } finally {
    await server.close();
  }
});

test('entrar: código errado, limite de tentativas, sala cheia e partida em andamento', async () => {
  const server = await startServer();
  try {
    const { host, code } = await roomWith(server.url, ['dono', 'g1', 'g2']);
    const intruder = await TestClient.open(server.url, 'invasor');
    const wrong = code === '1111' ? '2222' : '1111';
    const errors: string[] = [];
    for (let i = 0; i < 12; i++) errors.push(((await intruder.request({ t: 'join', code: wrong, me: ME })) as { error: string }).error);
    assert.deepEqual([...new Set(errors.slice(0, 10))], ['room_not_found']);
    assert.deepEqual(errors.slice(10), ['rate_limited', 'rate_limited']);
    assert.equal(((await intruder.request({ t: 'join', code, me: ME })) as { error: string }).error, 'rate_limited', 'bloqueado até para o código certo');

    await host.cmd({ type: 'startMatch' });
    const late = await TestClient.open(server.url, 'atrasado', { token: 'dev:atrasado' });
    // mesmo IP do invasor (127.0.0.1) → também limitado: o limite por IP pega quem troca de conta
    assert.equal(((await late.request({ t: 'join', code, me: ME })) as { error: string }).error, 'rate_limited');
  } finally {
    await server.close();
  }
});

test('partida em andamento e sala cheia recusam novos jogadores', async () => {
  const server = await startServer();
  try {
    const { host, code } = await roomWith(server.url, ['dono', 'g1', 'g2']);
    await host.cmd({ type: 'startMatch' });
    const late = await TestClient.open(server.url, 'atrasado');
    assert.equal(((await late.request({ t: 'join', code, me: ME })) as { error: string }).error, 'match_in_progress');

    const small = await TestClient.open(server.url, 'dono2');
    await small.ok({ t: 'create', input: { ...INPUT, maxPlayers: 3 }, me: ME });
    await small.untilSnapshot(() => true, 'sala');
    for (const n of ['x1', 'x2']) await (await TestClient.open(server.url, n)).ok({ t: 'join', code: small.snapshot!.room.code, me: ME });
    const extra = await TestClient.open(server.url, 'x3');
    assert.equal(((await extra.request({ t: 'join', code: small.snapshot!.room.code, me: ME })) as { error: string }).error, 'room_full');
  } finally {
    await server.close();
  }
});

test('reconexão: quem cai aparece desconectado, volta com resume e recebe o mesmo papel', async () => {
  const server = await startServer({}, { engineConfig: { ...FAST, graceMs: 2000 } });
  try {
    const { host, guests, code } = await roomWith(server.url, ['ana', 'bia', 'caio']);
    await host.cmd({ type: 'startMatch' });
    await guests[0].untilSnapshot((s) => s.room.phase === 'role_reveal', 'papel');
    const secretBefore = guests[0].game.secret;

    guests[0].drop();
    await host.untilSnapshot((s) => s.players.find((p) => p.id === guests[0].id)?.connected === false, 'bia desconectada');

    const back = await TestClient.open(server.url, 'bia');
    await back.ok({ t: 'resume', code });
    await back.untilSnapshot(() => true, 'snapshot ao voltar');
    assert.deepEqual(back.game.secret, secretBefore);
    await host.untilSnapshot((s) => s.players.every((p) => p.connected), 'todos conectados de novo');
    assert.equal(((await (await TestClient.open(server.url, 'estranho')).request({ t: 'resume', code })) as { error: string }).error, 'not_in_room');
  } finally {
    await server.close();
  }
});

test('host caiu e não voltou: outro jogador assume e a partida continua', async () => {
  const server = await startServer();
  try {
    const { host, guests, code } = await roomWith(server.url, ['ana', 'bia', 'caio', 'duda']);
    await host.cmd({ type: 'startMatch' });
    host.drop();
    await guests[0].untilSnapshot((s) => s.room.hostId === guests[0].id, 'bia virou host');
    await guests[1].untilSnapshot((s) => s.room.hostId === guests[0].id, 'caio viu o novo host');
    const snap = guests[1].snapshot!;
    assert.deepEqual(snap.players.map((p) => p.id), [guests[0].id, guests[1].id, guests[2].id]);
    assert.deepEqual([snap.room.phase, snap.room.roundIndex], ['role_reveal', 1], 'rodada sorteada de novo, sem o antigo host');

    for (const c of guests) await c.cmd({ type: 'ackRole' });
    await guests[0].cmd({ type: 'openVoting' });
    await guests[2].untilSnapshot((s) => s.room.phase === 'voting', 'novo host conduz');

    const ghost = await TestClient.open(server.url, 'ana');
    assert.equal(((await ghost.request({ t: 'resume', code })) as { error: string }).error, 'not_in_room');
  } finally {
    await server.close();
  }
});

test('mesmo usuário em outro aparelho: a conexão nova vence e o jogador não pisca como desconectado', async () => {
  const server = await startServer();
  try {
    const { host, guests, code } = await roomWith(server.url, ['ana', 'bia']);
    const second = await TestClient.open(server.url, 'bia');
    await guests[0].until(() => guests[0].closed !== null, 'conexão antiga fechada');
    assert.equal(guests[0].closed!.code, 4409);
    await second.ok({ t: 'resume', code });
    await sleep(50);
    assert.equal(host.snapshot!.players.find((p) => p.id === second.id)!.connected, true);
  } finally {
    await server.close();
  }
});

test('sair: quem sai recebe snapshot nulo, a sala vazia é destruída e o código volta a não existir', async () => {
  const server = await startServer();
  try {
    const { host, guests, code } = await roomWith(server.url, ['ana', 'bia']);
    await guests[0].ok({ t: 'leave' });
    await guests[0].until(() => guests[0].snapshot === null, 'snapshot nulo');
    await host.untilSnapshot((s) => s.players.length === 1, 'só o host');
    await host.ok({ t: 'leave' });
    assert.equal(server.manager.roomCount, 0);
    assert.equal(((await guests[0].request({ t: 'join', code, me: ME })) as { error: string }).error, 'room_not_found');
  } finally {
    await server.close();
  }
});

test('reinício do servidor: a sala volta do disco e os jogadores retomam com resume', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jogae-rooms-'));
  try {
    const first = await startServer({ ROOM_STORE_DIR: dir }, { engineConfig: { ...FAST, graceMs: 5000 } });
    const { host, guests, code } = await roomWith(first.url, ['ana', 'bia', 'caio']);
    await host.cmd({ type: 'startMatch' });
    await guests[1].untilSnapshot((s) => s.room.phase === 'role_reveal', 'papel');
    const secrets = [host, ...guests].map((c) => c.game.secret);
    await first.close();
    assert.deepEqual(readdirSync(dir), [`${code}.json`]);

    const second = await startServer({ ROOM_STORE_DIR: dir }, { engineConfig: { ...FAST, graceMs: 5000 } });
    try {
      assert.equal(second.manager.roomCount, 1);
      const revived = [];
      for (const name of ['ana', 'bia', 'caio']) {
        const c = await TestClient.open(second.url, name);
        await c.ok({ t: 'resume', code });
        await c.untilSnapshot(() => true, 'snapshot');
        revived.push(c);
      }
      assert.deepEqual(revived.map((c) => c.game.secret), secrets, 'mesmos papéis depois do reinício');
      await revived[2].untilSnapshot((s) => s.players.every((p) => p.connected), 'todos de volta');
      assert.equal(revived[0].snapshot!.room.hostId, host.id);
      for (const c of revived) await c.ok({ t: 'leave' });
      assert.deepEqual(readdirSync(dir), [], 'sala destruída some do disco');
    } finally {
      await second.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('API pública da sala: só o que cabe num convite, nada secreto, 404 para sala inexistente e limite de consultas', async () => {
  const server = await startServer();
  try {
    const { host, guests, code } = await roomWith(server.url, ['ana', 'bia', 'caio']);
    const get = (c: string) => fetch(`${server.base}/api/room/${c}`);

    const open = await get(code);
    assert.equal(open.status, 200);
    assert.equal(open.headers.get('access-control-allow-origin'), '*');
    assert.deepEqual(await open.json(), {
      code,
      gameId: 'impostor',
      status: 'open',
      host: { name: 'ana', initial: 'A', color: ME.color },
      count: 3,
      players: [{ initial: 'A', color: ME.color }, { initial: 'B', color: ME.color }, { initial: 'C', color: ME.color }],
    });

    await host.cmd({ type: 'startMatch' });
    const playing = await (await get(code)).text();
    assert.equal(JSON.parse(playing).status, 'playing');
    for (const secret of ['dev-ana', 'impostor"', 'word', 'secret', 'votes', 'points']) {
      if (secret === 'impostor"') continue; // o gameId legitimamente é "impostor"
      assert.ok(!playing.includes(secret), `a API pública vazou "${secret}"`);
    }

    const wrong = code === '1111' ? '2222' : '1111';
    assert.equal((await get(wrong)).status, 404);
    assert.equal((await fetch(`${server.base}/api/room/12345`)).status, 404, 'código malformado nem chega a consultar');

    await guests[1].ok({ t: 'leave' });
    await host.untilSnapshot((s) => s.room.phase === 'closed', 'sala fechada');
    assert.equal((await get(code)).status, 404, 'sala fechada some do convite');

    const statuses = new Set<number>();
    for (let i = 0; i < 70; i++) statuses.add((await get(wrong)).status);
    assert.ok(statuses.has(429), 'depois de 60 consultas no minuto, 429');
  } finally {
    await server.close();
  }
});

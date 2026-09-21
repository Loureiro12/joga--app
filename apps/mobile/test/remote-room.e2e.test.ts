/**
 * `RemoteRoomService` (o cliente do app) contra o `room-server` real, no mesmo processo.
 * Não precisa de Docker nem de rede: entra no `npm test` e no CI.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

import { RoomError, type ConnectionState, type RoomSnapshot } from '@jogae/engine';
import WebSocket from 'ws';

import { loadConfig } from '../../room-server/src/config';
import { createRoomServer, type RoomServer } from '../../room-server/src/server';
import { RemoteRoomService } from '../src/features/match/services/RemoteRoomService';

const FAST = { revealStage1Ms: 30, revealStage2Ms: 60, allVotedPauseMs: 10, graceMs: 600, ackTimeoutMs: 5000 };
const INPUT = { gameId: 'impostor', category: 'Filmes', totalRounds: 1, maxPlayers: 5 };

let server: RoomServer;
let url = '';

before(async () => {
  server = createRoomServer(loadConfig({ PORT: '0', NODE_ENV: 'test', AUTH_MODE: 'dev' }), { engineConfig: FAST, heartbeatMs: 100 });
  await new Promise<void>((resolve) => server.http.listen(0, resolve));
  url = `ws://127.0.0.1:${(server.http.address() as AddressInfo).port}/ws`;
});
after(() => server.close());

/** Um "celular": serviço + o que ele foi recebendo, e um gancho para derrubar a rede. */
function phone(name: string, opts: { token?: string | null } = {}) {
  const sockets: WebSocket[] = [];
  let blocked = false;
  class Tracked extends WebSocket {
    constructor(address: string) {
      super(blocked ? 'ws://127.0.0.1:9/ws' : address); // porta 9: ninguém escuta
      sockets.push(this);
    }
  }
  const service = new RemoteRoomService({
    url,
    getToken: async () => (opts.token === undefined ? `dev:${name}` : opts.token),
    WebSocketImpl: Tracked as never,
    reconnectTimeoutSec: 2,
    requestTimeoutMs: 1500,
    pingEveryMs: 200,
  });
  const state = { snapshot: null as RoomSnapshot | null, connection: [] as ConnectionState['status'][] };
  service.subscribe((s) => (state.snapshot = s));
  service.subscribeConnection((c) => state.connection.at(-1) !== c.status && state.connection.push(c.status));
  return {
    name,
    id: `dev-${name}`,
    me: { id: `dev-${name}`, name, color: '#22C55E' },
    service,
    state,
    dropNetwork: () => sockets.at(-1)?.terminate(),
    blockNetwork: (value: boolean) => (blocked = value),
  };
}

async function until(test: () => boolean, label: string, ms = 4000) {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw new Error(`timeout esperando: ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (e) {
    assert.ok(e instanceof RoomError, `esperava RoomError, veio ${e}`);
    return e.code;
  }
  return 'ok';
};

test('três celulares jogam uma partida inteira pela interface RoomService', async () => {
  const [ana, bia, caio] = [phone('ana'), phone('bia'), phone('caio')];
  const created = await ana.service.createRoom(INPUT, ana.me);
  assert.match(created.room.code, /^\d{4}$/);
  assert.equal(created.room.hostId, ana.id);

  const code = created.room.code;
  assert.equal((await bia.service.joinRoom(code, bia.me)).players.length, 2);
  await caio.service.joinRoom(code, caio.me);
  await until(() => ana.state.snapshot?.players.length === 3, 'host vê os 3');

  assert.equal(await errorCode(bia.service.startMatch()), 'not_host');
  await ana.service.startMatch();
  const all = [ana, bia, caio];
  await until(() => all.every((p) => p.state.snapshot?.room.phase === 'role_reveal'), 'todos veem o papel');
  assert.equal(all.filter((p) => p.state.snapshot!.secret!.role === 'impostor').length, 1);

  await ana.service.ackRole();
  await bia.service.ackRole();
  assert.equal(ana.state.snapshot!.room.phase, 'role_reveal', 'espera o terceiro confirmar');
  await caio.service.ackRole();
  await until(() => all.every((p) => p.state.snapshot?.room.phase === 'clues'), 'pistas');

  await ana.service.setTimerRunning(true);
  await until(() => caio.state.snapshot?.round?.timer.running === true, 'cronômetro rodando para o convidado');
  await bia.service.setPaused(true);
  await until(() => ana.state.snapshot?.room.paused === true, 'pausa chega ao host');
  await ana.service.setPaused(false);
  await ana.service.openVoting();
  await until(() => all.every((p) => p.state.snapshot?.room.phase === 'voting'), 'votação');

  const impostor = all.find((p) => p.state.snapshot!.secret!.role === 'impostor')!;
  const innocent = all.find((p) => p !== impostor)!;
  for (const p of all) await p.service.castVote(p === impostor ? innocent.id : impostor.id);
  await until(() => all.every((p) => p.state.snapshot?.result?.stage === 2), 'desfecho');
  assert.equal(bia.state.snapshot!.result!.caught, true);

  await ana.service.nextRound();
  await until(() => all.every((p) => p.state.snapshot?.room.phase === 'finished'), 'fim');
  assert.equal(caio.state.snapshot!.summary!.impostorsCaught, 1);

  await bia.service.leaveRoom();
  assert.equal(bia.state.snapshot, null);
  await until(() => ana.state.snapshot?.players.length === 2, 'host vê a saída');
  await Promise.all([ana.service.leaveRoom(), caio.service.leaveRoom()]);
});

test('erros de entrada viram RoomError com o código do servidor', async () => {
  const p = phone('perdido');
  assert.equal(await errorCode(p.service.joinRoom('0000', p.me)), 'room_not_found');
  assert.equal(await errorCode(p.service.startMatch()), 'not_in_room');
  const semLogin = phone('semlogin', { token: null });
  assert.equal(await errorCode(semLogin.service.createRoom(INPUT, semLogin.me)), 'unauthenticated');
  const tokenRuim = phone('ruim', { token: 'expirado' });
  assert.equal(await errorCode(tokenRuim.service.createRoom(INPUT, tokenRuim.me)), 'unauthenticated');
});

test('rede caiu e voltou: reconecta sozinho, retoma a sala e mantém o papel', async () => {
  const [ana, bia, caio] = [phone('ana2'), phone('bia2'), phone('caio2')];
  const { room } = await ana.service.createRoom(INPUT, ana.me);
  await bia.service.joinRoom(room.code, bia.me);
  await caio.service.joinRoom(room.code, caio.me);
  await ana.service.startMatch();
  await until(() => bia.state.snapshot?.room.phase === 'role_reveal', 'papel');
  const secret = bia.state.snapshot!.secret;

  bia.dropNetwork();
  // Não exigimos que o host a veja "desconectada": se a volta for rápida, a conexão nova substitui a velha sem piscar.
  await until(() => bia.state.connection.at(-1) === 'online' && bia.state.connection.includes('reconnecting'), 'bia reconectou');
  await until(() => ana.state.snapshot!.players.every((p) => p.connected), 'host vê todos de volta');
  assert.deepEqual(bia.state.snapshot!.secret, secret);
  assert.deepEqual(bia.state.connection, ['online', 'reconnecting', 'online']);

  await bia.service.ackRole(); // o serviço continua utilizável depois de reconectar
  await Promise.all([ana, bia, caio].map((p) => p.service.leaveRoom()));
});

test('rede não voltou a tempo: vira "failed", a vaga é liberada e outro jogador assume o host', async () => {
  const [ana, bia, caio, duda] = [phone('ana3'), phone('bia3'), phone('caio3'), phone('duda3')];
  const { room } = await ana.service.createRoom(INPUT, ana.me);
  for (const p of [bia, caio, duda]) await p.service.joinRoom(room.code, p.me);
  await ana.service.startMatch();

  ana.blockNetwork(true);
  ana.dropNetwork();
  await until(() => bia.state.snapshot?.room.hostId === bia.id, 'bia assume o host', 5000);
  await until(() => ana.state.connection.at(-1) === 'failed', 'ana desiste', 5000);

  // "Tentar de novo" com a rede de volta: o servidor já não a conhece mais nesta sala.
  ana.blockNetwork(false);
  ana.service.retryConnection();
  await until(() => ana.state.connection.at(-1) === 'failed' && ana.state.connection.filter((s) => s === 'reconnecting').length === 2, 'nova tentativa falha de vez');
  assert.equal(bia.state.snapshot!.players.some((p) => p.id === ana.id), false);
  await Promise.all([ana, bia, caio, duda].map((p) => p.service.leaveRoom()));
  assert.equal(ana.state.connection.at(-1), 'online', 'sair da sala limpa o estado de conexão');
});

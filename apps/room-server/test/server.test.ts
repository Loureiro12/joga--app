import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

import { loadConfig } from '../src/config';
import { createRoomServer } from '../src/server';

const server = createRoomServer(loadConfig({ PORT: '0', NODE_ENV: 'test' }));
let base = '';

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

test('GET /healthz responde ok e enxerga o engine compartilhado', async () => {
  const res = await fetch(`${base}/healthz`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { status: string; env: string; games: { impostor: { minPlayers: number } } };
  assert.equal(body.status, 'ok');
  assert.equal(body.env, 'test');
  assert.equal(body.games.impostor.minPlayers, 3);
});

test('rota desconhecida responde 404 em JSON', async () => {
  const res = await fetch(`${base}/nope`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'not_found' });
});

test('loadConfig rejeita ambiente inválido', () => {
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT inválida/);
  assert.throws(() => loadConfig({ NODE_ENV: 'staging' }), /NODE_ENV inválido/);
});

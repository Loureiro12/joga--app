import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SupabaseRoomPresence, type PresenceRoom, type RoomPresence } from '../src/rooms/RoomPresence';
import { roomWith, sleep, startServer } from './helpers';

/** Guarda o estado como a tabela `active_rooms` guardaria. */
class SpyPresence implements RoomPresence {
  readonly rooms = new Map<string, PresenceRoom>();
  resets = 0;
  publish(room: PresenceRoom) {
    this.rooms.set(room.code, room);
  }
  remove(code: string) {
    this.rooms.delete(code);
  }
  reset(rooms: PresenceRoom[]) {
    this.resets++;
    this.rooms.clear();
    for (const room of rooms) this.publish(room);
  }
  dispose() {}
}

test('"jogando agora" acompanha a sala: lobby aberto → em partida → some quando todos saem', async () => {
  const presence = new SpyPresence();
  const server = await startServer({}, { presence });
  try {
    assert.equal(presence.resets, 1, 'a subida limpa o que sobrou de antes');
    const { clients, host, guests } = await roomWith(server.url, ['ana', 'bia', 'caio']);
    const code = host.snapshot!.room.code;

    assert.deepEqual([presence.rooms.get(code)?.status, presence.rooms.get(code)?.gameId], ['open', 'impostor']);
    assert.deepEqual([...presence.rooms.get(code)!.playerIds].sort(), clients.map((c) => c.id).sort());

    await host.cmd({ type: 'startMatch' });
    assert.equal(presence.rooms.get(code)?.status, 'playing');

    // Quem sai deixa de aparecer como "jogando"; com menos de 3 a sala fecha e some da lista.
    await guests[1].ok({ t: 'leave' });
    await host.untilSnapshot((s) => s.room.phase === 'closed', 'sala fechada');
    await sleep(20);
    assert.equal(presence.rooms.has(code), false);
  } finally {
    await server.close();
  }
});

test('presença no Supabase: só ids de usuário real, não repete o que não mudou, e respeita a ordem', async () => {
  const calls: { method: string; url: string; headers: Headers; body: unknown }[] = [];
  const logs: string[] = [];
  let failNext = false;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ method: String(init.method), url, headers: new Headers(init.headers), body: init.body ? JSON.parse(String(init.body)) : null });
    if (failNext) return (failNext = false), new Response('fora do ar', { status: 503 });
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  const presence = new SupabaseRoomPresence('https://x.supabase.co', 'SEGREDO', (e) => logs.push(e), fakeFetch, 0);

  const ana = '00000000-0000-4000-8000-00000000000a';
  const bia = '00000000-0000-4000-8000-00000000000b';
  presence.reset([]);
  presence.publish({ code: '4827', gameId: 'impostor', status: 'open', playerIds: [bia, 'dev:bot-1', ana] });
  presence.publish({ code: '4827', gameId: 'impostor', status: 'open', playerIds: [ana, bia, 'dev:bot-2'] });
  presence.publish({ code: '4827', gameId: 'impostor', status: 'playing', playerIds: [ana, bia] });
  presence.remove('4827');
  presence.remove('4827');
  await presence.idle();

  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.url.split('/rest/v1/')[1]}`),
    ['DELETE active_rooms?code=not.is.null', 'POST active_rooms?on_conflict=code', 'POST active_rooms?on_conflict=code', 'DELETE active_rooms?code=eq.4827'],
    'o segundo publish não mudou nada (só trocou o bot) e o segundo remove não tinha o que apagar',
  );
  assert.deepEqual([calls[1].headers.get('apikey'), calls[1].headers.get('authorization')], ['SEGREDO', 'Bearer SEGREDO']);
  assert.match(calls[1].headers.get('prefer') ?? '', /merge-duplicates/);
  const [row] = calls[1].body as { code: string; status: string; player_ids: string[] }[];
  assert.deepEqual([row.code, row.status, row.player_ids], ['4827', 'open', [ana, bia]]);

  // Falha não lança nem trava a fila: a próxima escrita sai normalmente.
  failNext = true;
  presence.publish({ code: '1000', gameId: 'impostor', status: 'open', playerIds: [ana] });
  presence.publish({ code: '1000', gameId: 'impostor', status: 'playing', playerIds: [ana] });
  await presence.idle();
  assert.deepEqual(logs, ['presence_publish_failed']);
  assert.equal(calls.length, 6);
  presence.dispose();
});

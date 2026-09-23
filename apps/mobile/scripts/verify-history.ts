/**
 * Verificação de ponta a ponta do histórico contra o Supabase REAL (o projeto de dev linkado):
 * sobe o servidor de salas neste processo com o `.env` de apps/room-server, joga uma partida de
 * 1 rodada com 2 contas de convidado reais + 1 bot, e confere que Histórico, estatísticas e o
 * isolamento entre jogadores saíram certos. Apaga as contas de teste no fim.
 *
 *   npm run verify:history        (da raiz; exige SUPABASE_SERVICE_ROLE_KEY em apps/room-server/.env)
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';

import type { RoomSnapshot } from '@jogae/engine';

/** Este roteiro joga Impostor: estreita a parte do jogo no snapshot. */
const view = (s: RoomSnapshot | null) => s?.game as Extract<RoomSnapshot['game'], { kind: 'impostor' }>;
import WebSocket from 'ws';

import { loadConfig } from '../../room-server/src/config';
import { createRoomServer } from '../../room-server/src/server';
import { SupabaseHistoryService } from '../src/features/history/SupabaseHistoryService';
import { RemoteRoomService } from '../src/features/match/services/RemoteRoomService';

const envFile = resolve(__dirname, '../../room-server/.env');
if (!existsSync(envFile)) throw new Error(`Não achei ${envFile}. Copie o .env.example e preencha.`);
process.loadEnvFile(envFile);
const config = loadConfig({ ...process.env, PORT: '0', NODE_ENV: 'development', AUTH_MODE: 'supabase+dev', ROOM_STORE_DIR: '' });
if (!config.supabaseServiceRoleKey) {
  console.error('\n✗ SUPABASE_SERVICE_ROLE_KEY não está em apps/room-server/.env — sem ela o servidor não grava o histórico.\n');
  process.exit(1);
}

const until = async (test: () => boolean | Promise<boolean>, label: string, ms = 20_000) => {
  const end = Date.now() + ms;
  while (!(await test())) {
    if (Date.now() > end) throw new Error(`timeout: ${label}`);
    await new Promise((r) => setTimeout(r, 150));
  }
};

async function main() {
  const events: string[] = [];
  const server = createRoomServer(config, {
    engineConfig: { revealStage1Ms: 30, revealStage2Ms: 60, allVotedPauseMs: 10 },
    log: (event, data) => (events.push(event), event.startsWith('match_record') && console.log('  servidor:', event, JSON.stringify(data))),
  });
  await new Promise<void>((r) => server.http.listen(0, r));
  const url = `ws://127.0.0.1:${(server.http.address() as AddressInfo).port}/ws`;

  const realPlayer = async (name: string) => {
    const supabase = createClient(config.supabaseUrl!, config.supabaseAnonKey!, { realtime: { transport: WebSocket as never }, auth: { autoRefreshToken: false } });
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    const room = new RemoteRoomService({ url, WebSocketImpl: WebSocket as never, getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null });
    return { name, id: data.user!.id, supabase, room, history: new SupabaseHistoryService(supabase), me: { id: data.user!.id, name, color: '#7C3AED' } };
  };
  const ana = await realPlayer('Ana Teste');
  const bia = await realPlayer('Bia Teste');
  const bot = { room: new RemoteRoomService({ url, WebSocketImpl: WebSocket as never, getToken: async () => 'dev:verify-bot' }), me: { id: 'x', name: 'Bot', color: '#22C55E' } };

  try {
    const snaps = new Map<object, import('@jogae/engine').RoomSnapshot | null>();
    for (const p of [ana, bia, bot]) p.room.subscribe((s) => snaps.set(p, s));
    const phase = (p: object) => snaps.get(p)?.room.phase;

    const { room } = await ana.room.createRoom({ gameId: 'impostor', category: 'Filmes', totalRounds: 1, maxPlayers: 4 }, ana.me);
    await bia.room.joinRoom(room.code, bia.me);
    await bot.room.joinRoom(room.code, bot.me);
    await ana.room.startMatch();
    const all = [ana, bia, bot];
    await until(() => all.every((p) => phase(p) === 'role_reveal'), 'papel');
    for (const p of all) await p.room.ackRole();
    await until(() => phase(ana) === 'clues', 'pistas');
    await ana.room.openVoting();
    await until(() => all.every((p) => phase(p) === 'voting'), 'votação');
    const impostor = all.find((p) => view(snaps.get(p)!).secret!.role === 'impostor')!;
    const innocent = all.find((p) => p !== impostor)!;
    const idOf = (p: object) => snaps.get(p)!.meId;
    for (const p of all) await p.room.castVote(p === impostor ? idOf(innocent) : idOf(impostor));
    await until(() => view(snaps.get(ana) ?? null)?.result?.stage === 2, 'desfecho');
    await ana.room.nextRound();
    await until(() => phase(ana) === 'finished', 'fim');
    console.log('✓ partida real jogada até o fim na sala', room.code);

    await until(() => events.includes('match_recorded') || events.includes('match_record_rejected') || events.includes('match_record_failed'), 'gravação');
    assert.ok(events.includes('match_recorded'), 'o servidor não conseguiu gravar — veja a linha "servidor:" acima');

    const [anaList, biaList] = [await ana.history.list(), await bia.history.list()];
    assert.equal(anaList.length, 1);
    assert.equal(biaList.length, 1);
    assert.equal(anaList[0].id, biaList[0].id, 'as duas veem a MESMA partida');
    assert.deepEqual([anaList[0].gameId, anaList[0].wordCategory, anaList[0].players], ['impostor', 'Filmes', 3]);
    console.log('✓ Histórico da Ana:', JSON.stringify(anaList[0]));
    console.log('✓ Histórico da Bia:', JSON.stringify({ position: biaList[0].position, points: biaList[0].points, won: biaList[0].won }));

    const scores = snaps.get(ana)!.scores;
    const expected = (id: string) => scores.find((s) => s.playerId === id)!.points;
    assert.equal(anaList[0].points, expected(ana.id), 'pontos do histórico = pontos do placar final');
    assert.equal(biaList[0].points, expected(bia.id));

    const stats = await ana.history.stats();
    assert.deepEqual([stats.matches, stats.favoriteGameId], [1, 'impostor']);
    assert.equal(stats.wins, anaList[0].won ? 1 : 0);
    console.log('✓ Estatísticas da Ana:', JSON.stringify(stats), '| conquistas:', JSON.stringify(await ana.history.achievements()));

    const { data: others } = await ana.supabase.from('match_players').select('name');
    assert.deepEqual(others?.map((o) => o.name), ['Ana Teste'], 'a Ana só lê a própria linha do boletim');
    console.log('✓ Isolamento: cada uma só enxerga a própria linha do boletim');
  } finally {
    for (const p of [ana, bia]) {
      await p.room.leaveRoom().catch(() => {});
      await p.supabase.rpc('delete_my_account');
    }
    await bot.room.leaveRoom().catch(() => {});
    await server.close();
    console.log('✓ contas de teste apagadas (a partida fica no banco sem vínculo com ninguém)');
  }
  console.log('\nHISTÓRICO OK\n');
  process.exit(0);
}

main().catch((e) => {
  console.error('\nVERIFICAÇÃO FALHOU:', e.message, '\n');
  process.exit(1);
});

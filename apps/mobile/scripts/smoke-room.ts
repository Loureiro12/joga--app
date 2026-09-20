/**
 * Teste de fumaça do contrato RoomService: joga uma partida inteira como host e como convidado
 * contra o MockRoomService com timers acelerados. Rode com `npm run smoke:room`.
 * Serve também de checklist para a implementação real (Supabase/Firebase).
 */
import { MockRoomService, DEFAULT_MOCK_CONFIG } from '../src/features/match/services/MockRoomService';
import type { RoomSnapshot } from '@jogae/engine';

const fast = Object.fromEntries(Object.entries(DEFAULT_MOCK_CONFIG).map(([k, v]) => [k, k.endsWith('Sec') ? v : Math.max(5, Math.round((v as number) / 100))])) as typeof DEFAULT_MOCK_CONFIG;
const until = (svc: MockRoomService, pred: (s: RoomSnapshot) => boolean, label: string) =>
  new Promise<RoomSnapshot>((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout: ' + label)), 5000);
    let un: (() => void) | undefined; let done = false;
    un = svc.subscribe((s) => { if (!done && s && pred(s)) { done = true; clearTimeout(t); setTimeout(() => un?.(), 0); res(s); } });
  });
const me = { id: 'me', name: 'Vini', color: '#FACC15' };

async function host() {
  const svc = new MockRoomService(fast);
  await svc.createRoom({ gameId: 'impostor', category: 'Aleatório', totalRounds: 3, maxPlayers: 5 }, me);
  let s = await until(svc, (x) => x.players.length === 5, 'lobby full');
  console.log('host lobby', s.room.code, s.players.map((p) => p.name).join(','));
  await svc.startMatch();
  for (let r = 1; r <= 3; r++) {
    s = await until(svc, (x) => x.room.phase === 'role_reveal' && x.room.roundIndex === r, 'reveal ' + r);
    console.log(' round', r, 'secret', JSON.stringify(s.secret), 'starter', s.round?.starterId);
    await svc.ackRole();
    await svc.setTimerRunning(true); await svc.setPaused(true); await svc.setPaused(false);
    await svc.openVoting();
    s = await until(svc, (x) => x.room.phase === 'voting', 'voting');
    await svc.castVote(s.players.find((p) => p.id !== 'me')!.id);
    s = await until(svc, (x) => x.result?.stage === 2, 'stage2');
    console.log('  caught', s.result!.caught, 'tally', JSON.stringify(s.result!.tally), 'votes', s.votes?.votedIds.length + '/' + s.votes?.total);
    await svc.nextRound();
  }
  s = await until(svc, (x) => x.room.phase === 'finished', 'finished');
  console.log('host finished', JSON.stringify(s.summary), s.scores.map((x) => `${x.playerId}:${x.points}`).join(' '));
  await svc.playAgain();
  s = await until(svc, (x) => x.room.phase === 'lobby', 'again');
  console.log('play again ok, scores reset:', s.scores.every((x) => x.points === 0));
  await svc.leaveRoom();
}

async function guest() {
  const svc = new MockRoomService(fast);
  await svc.joinRoom('0000', me).then(() => console.log('BUG: joined bad code'), (e) => console.log('bad code →', e.code));
  await svc.joinRoom('4827', me);
  try { await svc.startMatch(); console.log('BUG: guest started'); } catch (e: any) { console.log('guest startMatch →', e.code); }
  let s = await until(svc, (x) => x.room.phase === 'role_reveal', 'guest reveal');
  console.log('guest: host bot started, players', s.players.length);
  await svc.ackRole();
  s = await until(svc, (x) => x.room.phase === 'voting', 'guest voting (bot host)');
  await svc.castVote(s.room.hostId);
  await until(svc, (x) => x.result?.stage === 2, 'guest result');
  s = await until(svc, (x) => x.room.roundIndex === 2, 'guest round 2 (bot host)');
  console.log('guest: bot host advanced to round', s.room.roundIndex);
  const conn: string[] = [];
  svc.subscribeConnection((c) => conn.push(c.status));
  svc.debug.simulateHostLeft();
  s = await until(svc, (x) => x.room.phase === 'closed', 'closed');
  console.log('host left →', s.room.closedReason, 'host connected:', s.players.find((p) => p.isHost)?.connected);
  await svc.leaveRoom();
}

host().then(guest).then(() => { console.log('SMOKE OK'); process.exit(0); }).catch((e) => { console.error('SMOKE FAIL', e); process.exit(1); });

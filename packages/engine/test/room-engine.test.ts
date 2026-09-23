import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_ENGINE_CONFIG, RoomEngine, RoomError, type GameView, type PlayerId, type RoomCommand, type Scheduler } from '../src/index';
import type { ImpostorState } from '../src/room/impostorGame';

type ImpostorView = Extract<GameView, { kind: 'impostor' }>;

/**
 * Este arquivo testa a SALA usando o Impostor. Os dois helpers achatam a parte do jogo
 * (`snapshot.game` / `state.game`) para as asserções ficarem diretas.
 */
const snapshotFor = (engine: RoomEngine, id: PlayerId) => {
  const snapshot = engine.snapshotFor(id);
  return { ...snapshot, ...(snapshot.game as ImpostorView) };
};
const stateOf = (engine: RoomEngine) => engine.serialize().game as ImpostorState;

/** Relógio falso: o tempo só anda quando o teste manda, e os alarmes disparam na ordem certa. */
function fakeClock(start = 1_000_000) {
  let now = start;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const scheduler: Scheduler = {
    now: () => now,
    setTimeout: (fn, ms) => (timers.set(++seq, { at: now + ms, fn }), seq),
    clearTimeout: (handle) => void timers.delete(handle as number),
  };
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      now = Math.max(now, next[1].at);
      next[1].fn();
    }
    now = target;
  };
  return { scheduler, advance, pending: () => timers.size };
}

const INPUT = { gameId: 'impostor' as const, category: 'Comidas', totalRounds: 2, maxPlayers: 6 };
const who = (id: string) => ({ id, name: id.toUpperCase(), color: '#7C3AED' });
const C = DEFAULT_ENGINE_CONFIG;

function room(ids = ['a', 'b', 'c', 'd'], input = INPUT) {
  const clock = fakeClock();
  let changes = 0;
  const engine = RoomEngine.create('4827', input, who(ids[0]), { scheduler: clock.scheduler, onChange: () => changes++ });
  ids.slice(1).forEach((id, i) => (clock.advance(10 + i), engine.join(who(id))));
  const all = (cmd: RoomCommand, from = engine.playerIds) => from.forEach((id) => engine.dispatch(id, cmd));
  const impostor = () => stateOf(engine).round!.impostorId;
  /** Leva a sala até a votação. */
  const toVoting = () => {
    if (engine.phase === 'lobby') engine.dispatch(engine.hostId, { type: 'startMatch' });
    all({ type: 'ackRole' });
    engine.dispatch(engine.hostId, { type: 'openVoting' });
  };
  /** Todos votam em `target` (o alvo vota em outro) e a revelação vai até o fim. */
  const voteAndReveal = (target: PlayerId) => {
    const other = engine.playerIds.find((id) => id !== target)!;
    for (const id of engine.playerIds) engine.dispatch(id, { type: 'castVote', targetId: id === target ? other : target });
    clock.advance(C.allVotedPauseMs + C.revealStage2Ms);
  };
  return { engine, clock, all, impostor, toVoting, voteAndReveal, changes: () => changes };
}

const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof RoomError, `esperava RoomError, veio ${e}`);
    return e.code;
  }
  return 'ok';
};

test('lobby: entra, enche, e não aceita gente com a partida em andamento', () => {
  const { engine } = room(['a', 'b', 'c'], { ...INPUT, maxPlayers: 3 });
  assert.equal(code(() => engine.join(who('z'))), 'room_full');
  engine.dispatch('a', { type: 'startMatch' });
  assert.equal(code(() => engine.join(who('z'))), 'match_in_progress');
  assert.equal(code(() => engine.join(who('b'))), 'ok', 'quem já é da sala sempre pode voltar');
});

test('só o host comanda; o piso para começar é técnico (2), não o recomendado', () => {
  const { engine } = room(['a', 'b']);
  assert.equal(code(() => engine.dispatch('b', { type: 'startMatch' })), 'not_host');
  assert.equal(code(() => engine.dispatch('x', { type: 'ackRole' })), 'not_in_room');

  // Com um sozinho não há em quem votar: aí sim é recusado.
  engine.setConnected('b', false);
  assert.equal(code(() => engine.dispatch('a', { type: 'startMatch' })), 'not_enough_players', 'desconectado não conta');

  engine.setConnected('b', true);
  engine.dispatch('a', { type: 'startMatch' });
  assert.equal(engine.phase, 'role_reveal', 'dois bastam: o 3 é recomendação, não regra');
});

test('segredo: cada snapshot só traz o papel de quem pediu, e exatamente um é impostor', () => {
  const { engine, impostor } = room();
  engine.dispatch('a', { type: 'startMatch' });
  const roles = engine.playerIds.map((id) => snapshotFor(engine, id).secret!);
  assert.equal(roles.filter((r) => r.role === 'impostor').length, 1);
  assert.deepEqual(snapshotFor(engine, impostor()).secret, { role: 'impostor' });
  for (const id of engine.playerIds) {
    const wire = JSON.stringify(snapshotFor(engine, id));
    assert.ok(!wire.includes('impostorId'), 'o id do impostor não pode ir no snapshot durante a rodada');
    if (id === impostor()) assert.ok(!wire.includes(stateOf(engine).round!.word.word), 'o impostor não pode receber a palavra');
  }
});

test('papel: a fase só avança quando todos os conectados confirmam', () => {
  const { engine } = room();
  engine.dispatch('a', { type: 'startMatch' });
  for (const id of ['a', 'b', 'c']) engine.dispatch(id, { type: 'ackRole' });
  assert.equal(engine.phase, 'role_reveal');
  assert.deepEqual(snapshotFor(engine, 'a').round!.ackedIds, ['a', 'b', 'c']);
  engine.dispatch('d', { type: 'ackRole' });
  assert.equal(engine.phase, 'clues');
});

test('papel: quem caiu não trava a rodada, e há um tempo limite para quem nunca confirma', () => {
  const dropped = room();
  dropped.engine.dispatch('a', { type: 'startMatch' });
  for (const id of ['a', 'b', 'c']) dropped.engine.dispatch(id, { type: 'ackRole' });
  dropped.engine.setConnected('d', false);
  assert.equal(dropped.engine.phase, 'clues');

  const slow = room();
  slow.engine.dispatch('a', { type: 'startMatch' });
  slow.clock.advance(C.ackTimeoutMs - 1);
  assert.equal(slow.engine.phase, 'role_reveal');
  slow.clock.advance(1);
  assert.equal(slow.engine.phase, 'clues');
});

test('cronômetro: conta pelo horário de término, sem um snapshot por segundo', () => {
  const { engine, clock, all, changes } = room();
  engine.dispatch('a', { type: 'startMatch' });
  all({ type: 'ackRole' });
  engine.dispatch('a', { type: 'setTimerRunning', running: true });
  const before = changes();
  clock.advance(20_000);
  assert.equal(changes(), before, '20 s de cronômetro rodando não podem gerar nenhuma emissão');
  assert.deepEqual(snapshotFor(engine, 'b').round!.timer, { durationSec: 60, remainingSec: 40, running: true });

  engine.dispatch('a', { type: 'setTimerRunning', running: false });
  clock.advance(5_000);
  assert.deepEqual(snapshotFor(engine, 'b').round!.timer, { durationSec: 60, remainingSec: 40, running: false });

  engine.dispatch('a', { type: 'setTimerRunning', running: true });
  clock.advance(40_000);
  assert.deepEqual(snapshotFor(engine, 'b').round!.timer, { durationSec: 60, remainingSec: 0, running: false });
  assert.equal(changes(), before + 3, 'pausar, retomar e zerar: uma emissão cada');

  engine.dispatch('a', { type: 'resetTimer' });
  assert.equal(snapshotFor(engine, 'b').round!.timer.remainingSec, 60);
});

test('pausa: qualquer jogador pausa, e pausar para o cronômetro', () => {
  const { engine, clock, all } = room();
  engine.dispatch('a', { type: 'startMatch' });
  all({ type: 'ackRole' });
  engine.dispatch('a', { type: 'setTimerRunning', running: true });
  clock.advance(10_000);
  engine.dispatch('c', { type: 'setPaused', paused: true });
  clock.advance(30_000);
  const snap = snapshotFor(engine, 'a');
  assert.equal(snap.room.paused, true);
  assert.deepEqual(snap.round!.timer, { durationSec: 60, remainingSec: 50, running: false });
  engine.dispatch('a', { type: 'setTimerRunning', running: true });
  assert.equal(snapshotFor(engine, 'a').round!.timer.running, false, 'pausado não roda');
});

test('votação: votos ficam ocultos, voto é voto, e não vale votar em si nem em quem não existe', () => {
  const { engine, toVoting } = room();
  toVoting();
  engine.dispatch('a', { type: 'castVote', targetId: 'b' });
  engine.dispatch('a', { type: 'castVote', targetId: 'c' });
  assert.equal(stateOf(engine).votes.a, 'b', 'o segundo voto é ignorado');
  assert.equal(code(() => engine.dispatch('b', { type: 'castVote', targetId: 'b' })), 'bad_request');
  assert.equal(code(() => engine.dispatch('b', { type: 'castVote', targetId: 'zz' })), 'bad_request');

  const seenByB = snapshotFor(engine, 'b');
  assert.deepEqual(seenByB.votes, { votedIds: ['a'], total: 4, myVote: null });
  assert.ok(!JSON.stringify(seenByB).includes('"a":"b"'), 'o alvo do voto alheio não vai no snapshot');
  assert.equal(snapshotFor(engine, 'a').votes!.myVote, 'b');
});

test('revelação em 3 tempos: nada do desfecho (nem os pontos) sai antes do último', () => {
  const { engine, clock, toVoting, impostor } = room();
  toVoting();
  const target = impostor();
  const other = engine.playerIds.find((id) => id !== target)!;
  for (const id of engine.playerIds) engine.dispatch(id, { type: 'castVote', targetId: id === target ? other : target });
  assert.equal(engine.phase, 'voting', 'há um respiro antes de revelar');
  clock.advance(C.allVotedPauseMs);

  const s0 = snapshotFor(engine, 'a');
  assert.equal(engine.phase, 'revealing');
  assert.deepEqual([s0.result!.stage, s0.result!.chosenId, s0.result!.impostorId, s0.result!.word], [0, '', '', '']);
  assert.ok(s0.scores.every((x) => x.points === 0), 'placar ainda zerado');

  clock.advance(C.revealStage1Ms);
  const s1 = snapshotFor(engine, 'a');
  assert.deepEqual([s1.result!.stage, s1.result!.chosenId, s1.result!.impostorId], [1, target, '']);
  assert.equal(code(() => engine.dispatch('a', { type: 'nextRound' })), 'invalid_phase', 'não dá para pular a revelação');

  clock.advance(C.revealStage2Ms - C.revealStage1Ms);
  const s2 = snapshotFor(engine, 'a');
  assert.equal(s2.result!.stage, 2);
  assert.equal(s2.result!.caught, true);
  assert.equal(s2.result!.impostorId, target);
  assert.equal(s2.scores.find((x) => x.playerId === target)!.points, 0);
  assert.equal(s2.scores.find((x) => x.playerId === other)!.points, 250);
});

test('partida inteira: rodadas, fim com campeão e "jogar novamente" zera o placar', () => {
  const { engine, toVoting, voteAndReveal, impostor } = room();
  toVoting();
  voteAndReveal(impostor());
  engine.dispatch('a', { type: 'nextRound' });
  assert.deepEqual([engine.phase, snapshotFor(engine, 'a').room.roundIndex], ['role_reveal', 2]);
  const words = stateOf(engine).usedWords;
  assert.equal(new Set(words).size, words.length, 'palavra não repete');

  toVoting();
  voteAndReveal(impostor());
  engine.dispatch('a', { type: 'nextRound' });
  const end = snapshotFor(engine, 'b');
  assert.equal(end.room.phase, 'finished');
  assert.equal(end.summary!.impostorsCaught, 2);
  assert.equal(end.summary!.winnerId, end.scores[0].playerId);

  assert.equal(code(() => engine.dispatch('b', { type: 'playAgain' })), 'not_host');
  engine.dispatch('a', { type: 'playAgain' });
  const again = snapshotFor(engine, 'a');
  assert.equal(again.room.phase, 'lobby');
  assert.ok(again.scores.every((x) => x.points === 0));
  assert.equal(again.players.length, 4, 'os jogadores continuam na sala');
});

test('boletim: só existe no fim, com colocação de competição, vitórias no empate e papéis contados', () => {
  const { engine, clock, toVoting, voteAndReveal, impostor } = room(['a', 'b', 'c', 'd'], { ...INPUT, totalRounds: 2 });
  assert.equal(engine.matchRecord(), null, 'lobby não tem boletim');
  toVoting();
  const firstImpostor = impostor();
  assert.equal(engine.matchRecord(), null, 'partida em andamento não tem boletim');
  voteAndReveal(firstImpostor); // pego: os 3 inocentes fazem 250
  engine.dispatch('a', { type: 'nextRound' });
  toVoting();
  const secondImpostor = impostor();
  const scapegoat = engine.playerIds.find((id) => id !== secondImpostor)!;
  voteAndReveal(scapegoat); // escapou: o impostor faz 300
  clock.advance(5_000);
  engine.dispatch('a', { type: 'nextRound' });

  const record = engine.matchRecord()!;
  assert.match(record.matchId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual([record.roomCode, record.gameId, record.totalRounds, record.impostorsCaught], ['4827', 'impostor', 2, 1]);
  assert.ok(record.endedAt - record.startedAt > 0);
  assert.equal(record.players.length, 4);

  const byId = Object.fromEntries(record.players.map((p) => [p.playerId, p]));
  assert.deepEqual([byId[firstImpostor].timesImpostor, byId[firstImpostor].timesEscaped], secondImpostor === firstImpostor ? [2, 1] : [1, 0]);
  assert.equal(byId[secondImpostor].timesEscaped, 1);
  assert.equal(record.players.reduce((n, p) => n + p.timesImpostor, 0), 2, 'um impostor por rodada');

  const top = Math.max(...record.players.map((p) => p.points));
  for (const p of record.players) {
    assert.equal(p.won, p.points === top, 'vence quem tem a maior pontuação, inclusive empatados');
    assert.equal(p.position, 1 + record.players.filter((o) => o.points > p.points).length);
  }
  assert.deepEqual(record.players.map((p) => p.points), [...record.players.map((p) => p.points)].sort((x, y) => y - x), 'ordenado do 1º ao último');

  const sameAgain = engine.matchRecord()!;
  assert.equal(sameAgain.matchId, record.matchId, 'o mesmo boletim pode ser pedido de novo (gravação idempotente)');
  engine.dispatch('a', { type: 'playAgain' });
  assert.equal(engine.matchRecord(), null);
  engine.dispatch('a', { type: 'startMatch' });
  assert.notEqual(engine.serialize().matchId, record.matchId, 'jogar novamente é outra partida');
});

test('boletim: quem saiu no meio não entra; sala fechada por falta de gente não gera boletim', () => {
  const left = room(['a', 'b', 'c', 'd'], { ...INPUT, totalRounds: 1 });
  left.engine.dispatch('a', { type: 'startMatch' });
  left.engine.leave('d');
  left.toVoting();
  left.voteAndReveal(left.impostor());
  left.engine.dispatch(left.engine.hostId, { type: 'nextRound' });
  assert.deepEqual(left.engine.matchRecord()!.players.map((p) => p.playerId).sort(), ['a', 'b', 'c']);

  const closed = room(['a', 'b', 'c']);
  closed.engine.dispatch('a', { type: 'startMatch' });
  closed.engine.leave('c');
  closed.engine.leave('b');
  assert.equal(closed.engine.phase, 'closed');
  assert.equal(closed.engine.matchRecord(), null);
});

test('reconexão: quem cai mantém vaga e pontos por 30 s, e voltando nada muda', () => {
  const { engine, clock } = room();
  engine.dispatch('a', { type: 'startMatch' });
  engine.setConnected('c', false);
  assert.equal(snapshotFor(engine, 'a').players.find((p) => p.id === 'c')!.connected, false);
  clock.advance(C.graceMs - 1);
  engine.setConnected('c', true);
  clock.advance(60_000 - C.graceMs);
  assert.ok(engine.has('c'));
  assert.equal(snapshotFor(engine, 'c').room.roundIndex, 1, 'a rodada não foi refeita');
});

test('host migra: ao sair (ou não voltar em 30 s) assume quem está há mais tempo e conectado', () => {
  const left = room();
  left.engine.dispatch('a', { type: 'startMatch' });
  left.engine.leave('a');
  assert.equal(left.engine.hostId, 'b');
  assert.deepEqual(snapshotFor(left.engine, 'c').players.map((p) => [p.id, p.isHost]), [['b', true], ['c', false], ['d', false]]);
  assert.equal(code(() => left.engine.dispatch('a', { type: 'openVoting' })), 'not_in_room');

  const dropped = room();
  dropped.engine.setConnected('b', false);
  dropped.clock.advance(1_000);
  dropped.engine.setConnected('a', false);
  assert.equal(dropped.engine.hostId, 'a', 'durante a tolerância o host continua sendo o host');
  dropped.clock.advance(C.graceMs);
  assert.equal(dropped.engine.hostId, 'c', 'b também tinha caído, então pula para c');
  assert.deepEqual(dropped.engine.playerIds, ['c', 'd']);
});

test('saída no meio da rodada: sorteia de novo com o mesmo número; com um só a sala fecha', () => {
  const { engine, all } = room();
  engine.dispatch('a', { type: 'startMatch' });
  all({ type: 'ackRole' });
  engine.dispatch('a', { type: 'openVoting' });
  engine.dispatch('b', { type: 'castVote', targetId: 'c' });
  engine.leave('d');
  const redealt = snapshotFor(engine, 'a');
  assert.deepEqual([redealt.room.phase, redealt.room.roundIndex, redealt.round!.order.length], ['role_reveal', 1, 3]);
  assert.deepEqual(stateOf(engine).votes, {}, 'votos da rodada anulada somem');
  assert.equal(redealt.round!.deal, 2, 'o cliente percebe o novo sorteio pelo `deal`');

  engine.leave('c');
  assert.equal(engine.phase, 'role_reveal', 'com dois a partida continua');
  engine.leave('b');
  const closed = snapshotFor(engine, 'a');
  assert.deepEqual([closed.room.phase, closed.room.closedReason], ['closed', 'not_enough_players']);
  assert.equal(code(() => engine.join(who('z'))), 'room_not_found');
});

test('votação não espera quem caiu', () => {
  const { engine, clock, toVoting } = room();
  toVoting();
  for (const id of ['a', 'b', 'c']) engine.dispatch(id, { type: 'castVote', targetId: id === 'a' ? 'b' : 'a' });
  assert.equal(engine.phase, 'voting');
  engine.setConnected('d', false);
  clock.advance(C.allVotedPauseMs);
  assert.equal(engine.phase, 'revealing');
  assert.equal(snapshotFor(engine, 'a').votes!.total, 3);
});

test('salvar e restaurar: a sala continua de onde parou, e prazos vencidos durante a parada disparam na volta', () => {
  const { engine, clock, toVoting, impostor } = room();
  toVoting();
  const target = impostor();
  const other = engine.playerIds.find((id) => id !== target)!;
  for (const id of engine.playerIds) engine.dispatch(id, { type: 'castVote', targetId: id === target ? other : target });
  const saved = JSON.parse(JSON.stringify(engine.serialize()));
  engine.dispose();

  clock.advance(10_000); // "deploy" de 10 s
  let emitted = 0;
  const revived = RoomEngine.restore(saved, { scheduler: clock.scheduler, onChange: () => emitted++ });
  assert.equal(revived.phase, 'voting');
  clock.advance(0);
  assert.equal(revived.phase, 'revealing', 'o respiro pós-votação venceu durante a parada');
  assert.equal(snapshotFor(revived, 'a').result!.stage, 0, 'a revelação começa agora: ninguém perde os 3 tempos');
  clock.advance(C.revealStage2Ms);
  assert.equal(snapshotFor(revived, 'a').result!.stage, 2);
  assert.equal(snapshotFor(revived, other).scores.find((x) => x.playerId === other)!.points, 250);
  assert.ok(emitted >= 1);
  assert.deepEqual(snapshotFor(revived, 'a').secret, snapshotFor(engine, 'a').secret);
});

test('dispose cancela o alarme', () => {
  const { engine, clock } = room();
  engine.setConnected('b', false);
  assert.equal(clock.pending(), 1);
  engine.dispose();
  assert.equal(clock.pending(), 0);
});

test('Impostor sem mínimo de produto: dois jogadores começam e a partida anda', () => {
  const clock = fakeClock();
  const engine = RoomEngine.create('4827', { gameId: 'impostor' as const, category: 'Comidas', totalRounds: 1, maxPlayers: 12 }, { id: 'a', name: 'A', color: '#7C3AED' }, { scheduler: clock.scheduler, rng: () => 0.5 });
  engine.join({ id: 'b', name: 'B', color: '#FACC15' });

  engine.dispatch('a', { type: 'startMatch' });
  assert.equal(engine.phase, 'role_reveal', 'o motor não barra uma sala de dois');

  for (const id of ['a', 'b']) engine.dispatch(id, { type: 'ackRole' });
  engine.dispatch('a', { type: 'openVoting' });
  // Cada um só pode acusar o outro: o empate resultante sempre inocenta o impostor.
  engine.dispatch('a', { type: 'castVote', targetId: 'b' });
  engine.dispatch('b', { type: 'castVote', targetId: 'a' });
  clock.advance(DEFAULT_ENGINE_CONFIG.allVotedPauseMs + DEFAULT_ENGINE_CONFIG.revealStage2Ms + 10);

  const result = snapshotFor(engine, 'a').result!;
  assert.equal(result.stage, 2);
  assert.equal(result.caught, false, 'com dois, o empate sempre deixa o impostor escapar');

  engine.dispatch('a', { type: 'nextRound' });
  assert.equal(engine.phase, 'finished');
});

test('sobrando uma pessoa a sala fecha: ninguém teria em quem votar', () => {
  const clock = fakeClock();
  const engine = RoomEngine.create('4827', { gameId: 'impostor' as const, category: 'Comidas', totalRounds: 2, maxPlayers: 12 }, { id: 'a', name: 'A', color: '#7C3AED' }, { scheduler: clock.scheduler, rng: () => 0.5 });
  for (const id of ['b', 'c']) engine.join({ id, name: id, color: '#FACC15' });
  engine.dispatch('a', { type: 'startMatch' });

  engine.leave('c');
  assert.equal(engine.phase, 'role_reveal', 'com dois a partida continua (rodada re-sorteada)');
  engine.leave('b');
  assert.equal(engine.phase, 'closed');
});

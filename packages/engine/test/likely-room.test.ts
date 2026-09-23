import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_ENGINE_CONFIG, RoomEngine, RoomError, type GameView, type LikelySettings, type PlayerId, type Scheduler } from '../src/index';

type LikelyView = Extract<GameView, { kind: 'likely' }>;

/** Relógio falso: o tempo só anda quando o teste manda. */
function fakeClock(start = 1_000_000) {
  let now = start;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const scheduler: Scheduler = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (handle) => void timers.delete(handle as number),
  };
  const advance = (ms: number) => {
    const target = now + ms;
    for (let guard = 0; guard < 200; guard++) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = Math.max(now, due[1].at);
      due[1].fn();
    }
    now = target;
  };
  return { scheduler, advance };
}

const INPUT = { gameId: 'likely' as const, category: 'Aleatório', totalRounds: 2, maxPlayers: 20 };

function room(names: string[], settings: Partial<LikelySettings> = {}, totalRounds = 2) {
  const clock = fakeClock();
  const [host, ...guests] = names;
  const engine = RoomEngine.create('4827', { ...INPUT, totalRounds, settings }, { id: host, name: host, color: '#7C3AED' }, { scheduler: clock.scheduler, rng: () => 0.42 });
  for (const g of guests) engine.join({ id: g, name: g, color: '#FACC15' });
  const view = (id: PlayerId) => engine.snapshotFor(id).game as LikelyView;
  return { engine, clock, view, host, guests, all: names };
}

const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof RoomError, `esperava RoomError, veio ${e}`);
    return e.code;
  }
  assert.fail('deveria ter lançado');
};

/** Leva a rodada até a revelação completa, com os votos informados. */
function playRound(r: ReturnType<typeof room>, votes: Record<string, string>) {
  r.engine.dispatch(r.host, { type: 'openVoting' });
  for (const [voter, target] of Object.entries(votes)) r.engine.dispatch(voter, { type: 'castVote', targetId: target });
  r.clock.advance(DEFAULT_ENGINE_CONFIG.allVotedPauseMs + DEFAULT_ENGINE_CONFIG.revealStage2Ms + 10);
}

test('fluxo completo: pergunta → votação → revelação em 3 tempos → próxima', () => {
  const r = room(['ana', 'bia', 'caio']);
  assert.equal(r.engine.phase, 'lobby');

  r.engine.dispatch('ana', { type: 'startMatch' });
  assert.equal(r.engine.phase, 'question');
  const primeira = r.view('ana').round!;
  assert.deepEqual([primeira.index, primeira.totalRounds], [1, 2]);
  assert.ok(primeira.question.endsWith('?'));
  assert.deepEqual(primeira.targets.sort(), ['ana', 'bia', 'caio'], 'votar em si mesmo é o padrão');

  r.engine.dispatch('ana', { type: 'openVoting' });
  assert.equal(r.engine.phase, 'voting');
  // Ninguém vê em quem os outros votaram, só quantos já votaram.
  r.engine.dispatch('bia', { type: 'castVote', targetId: 'caio' });
  const parcial = r.engine.snapshotFor('ana').votes!;
  assert.deepEqual([parcial.votedIds, parcial.total, parcial.myVote], [['bia'], 3, null]);

  r.engine.dispatch('ana', { type: 'castVote', targetId: 'caio' });
  r.engine.dispatch('caio', { type: 'castVote', targetId: 'ana' });

  r.clock.advance(DEFAULT_ENGINE_CONFIG.allVotedPauseMs + 10);
  assert.equal(r.engine.phase, 'revealing');
  const t0 = r.view('ana').result!;
  assert.deepEqual([t0.stage, t0.winnerIds, t0.tally], [0, [], []], 'o primeiro tempo não entrega nada');

  r.clock.advance(DEFAULT_ENGINE_CONFIG.revealStage1Ms);
  assert.deepEqual([r.view('ana').result!.stage, r.view('ana').result!.winnerIds], [1, ['caio']]);

  r.clock.advance(DEFAULT_ENGINE_CONFIG.revealStage2Ms);
  const t2 = r.view('ana').result!;
  assert.equal(t2.stage, 2);
  assert.deepEqual(
    t2.tally.map((e) => [e.playerId, e.votes, e.voterIds]),
    [
      ['caio', 2, ['ana', 'bia']],
      ['ana', 1, ['caio']],
    ],
    'no modo aberto o resultado mostra quem votou em quem',
  );

  r.engine.dispatch('ana', { type: 'nextRound' });
  assert.equal(r.engine.phase, 'question');
  assert.equal(r.view('ana').round!.index, 2);
});

test('a pergunta não se repete na partida, e o host pode trocar antes de abrir a votação', () => {
  const r = room(['ana', 'bia', 'caio'], {}, 6);
  r.engine.dispatch('ana', { type: 'startMatch' });
  const vistas = new Set<string>();

  for (let rodada = 1; rodada <= 6; rodada++) {
    const antes = r.view('ana').round!.questionId;
    if (rodada === 1) {
      r.engine.dispatch('ana', { type: 'skipQuestion' });
      assert.notEqual(r.view('ana').round!.questionId, antes, 'trocar a pergunta traz outra');
      vistas.add(antes);
    }
    const atual = r.view('ana').round!.questionId;
    assert.equal(vistas.has(atual), false, `pergunta repetida na rodada ${rodada}`);
    vistas.add(atual);
    playRound(r, { ana: 'bia', bia: 'caio', caio: 'ana' });
    if (rodada < 6) r.engine.dispatch('ana', { type: 'nextRound' });
  }
  assert.equal(r.engine.phase, 'revealing');
  r.engine.dispatch('ana', { type: 'nextRound' });
  assert.equal(r.engine.phase, 'finished');
});

test('depois do primeiro voto a pergunta não pode mais ser trocada', () => {
  const r = room(['ana', 'bia', 'caio']);
  r.engine.dispatch('ana', { type: 'startMatch' });
  r.engine.dispatch('ana', { type: 'openVoting' });
  r.engine.dispatch('bia', { type: 'castVote', targetId: 'ana' });
  assert.equal(
    code(() => r.engine.dispatch('ana', { type: 'skipQuestion' })),
    'invalid_phase',
  );
});

test('só o host conduz, e voto é voto', () => {
  const r = room(['ana', 'bia', 'caio']);
  r.engine.dispatch('ana', { type: 'startMatch' });
  assert.equal(
    code(() => r.engine.dispatch('bia', { type: 'openVoting' })),
    'not_host',
  );
  assert.equal(
    code(() => r.engine.dispatch('bia', { type: 'castVote', targetId: 'ana' })),
    'invalid_phase',
  );

  r.engine.dispatch('ana', { type: 'openVoting' });
  r.engine.dispatch('bia', { type: 'castVote', targetId: 'ana' });
  r.engine.dispatch('bia', { type: 'castVote', targetId: 'caio' });
  assert.equal(r.engine.snapshotFor('bia').votes!.myVote, 'ana', 'o segundo voto é ignorado');
  assert.equal(
    code(() => r.engine.dispatch('caio', { type: 'castVote', targetId: 'ninguem' })),
    'bad_request',
  );
});

test('host encerra a votação adiantado, mas nunca sem voto nenhum', () => {
  const r = room(['ana', 'bia', 'caio']);
  r.engine.dispatch('ana', { type: 'startMatch' });
  r.engine.dispatch('ana', { type: 'openVoting' });
  assert.equal(
    code(() => r.engine.dispatch('ana', { type: 'endVoting' })),
    'bad_request',
  );

  r.engine.dispatch('bia', { type: 'castVote', targetId: 'caio' });
  r.engine.dispatch('ana', { type: 'endVoting' });
  r.clock.advance(DEFAULT_ENGINE_CONFIG.allVotedPauseMs + DEFAULT_ENGINE_CONFIG.revealStage2Ms + 10);
  const result = r.view('ana').result!;
  assert.deepEqual([result.winnerIds, result.totalVotes, result.eligibleCount], [['caio'], 1, 3]);
});

test('voto em si mesmo pode ser desligado pelo host', () => {
  const r = room(['ana', 'bia', 'caio'], { allowSelfVote: false });
  r.engine.dispatch('ana', { type: 'startMatch' });
  assert.deepEqual(r.view('ana').round!.targets.sort(), ['bia', 'caio']);
  r.engine.dispatch('ana', { type: 'openVoting' });
  assert.equal(
    code(() => r.engine.dispatch('ana', { type: 'castVote', targetId: 'ana' })),
    'bad_request',
  );
});

test('quem cai não trava a votação', () => {
  const r = room(['ana', 'bia', 'caio', 'duda']);
  r.engine.dispatch('ana', { type: 'startMatch' });
  r.engine.dispatch('ana', { type: 'openVoting' });
  r.engine.dispatch('ana', { type: 'castVote', targetId: 'duda' });
  r.engine.dispatch('bia', { type: 'castVote', targetId: 'duda' });
  r.engine.dispatch('duda', { type: 'castVote', targetId: 'ana' });

  // Caio perde o sinal sem ter votado: a rodada não pode esperar por ele para sempre.
  r.engine.setConnected('caio', false);
  r.clock.advance(DEFAULT_ENGINE_CONFIG.allVotedPauseMs + DEFAULT_ENGINE_CONFIG.revealStage2Ms + 10);
  assert.equal(r.engine.phase, 'revealing');

  const result = r.view('ana').result!;
  assert.deepEqual(result.winnerIds, ['duda']);
  assert.deepEqual([result.totalVotes, result.eligibleCount], [3, 4]);
});

test('quem sai no meio da votação não leva embora os votos que já recebeu', () => {
  const r = room(['ana', 'bia', 'caio', 'duda']);
  r.engine.dispatch('ana', { type: 'startMatch' });
  r.engine.dispatch('ana', { type: 'openVoting' });
  r.engine.dispatch('ana', { type: 'castVote', targetId: 'duda' });
  r.engine.dispatch('bia', { type: 'castVote', targetId: 'duda' });

  r.engine.leave('duda');
  // Ela deixa de ser esperada, mas os dois votos nela continuam na conta (spec §34).
  r.engine.dispatch('caio', { type: 'castVote', targetId: 'ana' });
  r.clock.advance(DEFAULT_ENGINE_CONFIG.allVotedPauseMs + DEFAULT_ENGINE_CONFIG.revealStage2Ms + 10);

  const result = r.view('ana').result!;
  assert.deepEqual(result.winnerIds, ['duda'], 'ganhou a pergunta mesmo tendo saído');
  assert.deepEqual([result.totalVotes, result.eligibleCount], [3, 3]);
});

test('sair no meio não re-sorteia a pergunta (ao contrário do Impostor)', () => {
  const r = room(['ana', 'bia', 'caio', 'duda']);
  r.engine.dispatch('ana', { type: 'startMatch' });
  const pergunta = r.view('ana').round!.questionId;
  r.engine.dispatch('ana', { type: 'openVoting' });
  r.engine.dispatch('bia', { type: 'castVote', targetId: 'caio' });

  r.engine.leave('duda');
  assert.equal(r.view('ana').round!.questionId, pergunta, 'a pergunta continua a mesma');
  assert.equal(r.engine.phase, 'voting');

  // Com menos de 3 a sala fecha, como em qualquer jogo.
  r.engine.leave('caio');
  assert.equal(r.engine.phase, 'closed');
});

test('partida sem limite só acaba quando o host encerra', () => {
  const r = room(['ana', 'bia', 'caio'], {}, 0);
  r.engine.dispatch('ana', { type: 'startMatch' });
  assert.equal(r.view('ana').round!.totalRounds, null);

  for (let i = 0; i < 3; i++) {
    playRound(r, { ana: 'bia', bia: 'caio', caio: 'ana' });
    r.engine.dispatch('ana', { type: 'nextRound' });
    assert.equal(r.engine.phase, 'question', 'sem limite nunca termina sozinha');
  }
  assert.equal(r.view('ana').round!.index, 4);

  r.engine.dispatch('ana', { type: 'endMatch' });
  assert.equal(r.engine.phase, 'finished');
});

test('o resumo do fim conta a partida e guarda as perguntas marcantes', () => {
  const r = room(['ana', 'bia', 'caio'], { competitive: true }, 2);
  r.engine.dispatch('ana', { type: 'startMatch' });
  // Rodada 1: unânime na Bia.
  playRound(r, { ana: 'bia', bia: 'bia', caio: 'bia' });
  r.engine.dispatch('ana', { type: 'nextRound' });
  // Rodada 2: Caio leva 2 votos e vence; quem votou nele acerta.
  playRound(r, { ana: 'caio', bia: 'caio', caio: 'ana' });
  r.engine.dispatch('ana', { type: 'nextRound' });

  assert.equal(r.engine.phase, 'finished');
  const summary = r.view('ana').summary!;
  assert.deepEqual([summary.questions, summary.votes, summary.unanimities], [2, 6, 1]);
  assert.deepEqual(summary.mostChosenIds, ['bia'], 'a Bia levou 3 votos; ninguém passou disso');
  assert.deepEqual([summary.ties], [0]);
  assert.equal(summary.highlights.length, 2);
  assert.ok(summary.highlights[0].question.endsWith('?'));

  // No competitivo, quem leu o grupo melhor lidera — não quem recebeu mais votos.
  // Ana e Bia acertaram as duas (150 da unanimidade + 100); Caio só a primeira.
  const scores = r.engine.snapshotFor('ana').scores;
  assert.deepEqual(
    scores.map((s) => [s.playerId, s.points]),
    [
      ['ana', 250],
      ['bia', 250],
      ['caio', 150],
    ],
  );
  assert.equal(r.view('ana').summary!.mostChosenIds[0], 'bia', 'a mais apontada não é a que pontuou mais');

  // O boletim do histórico sai com a partida inteira.
  const record = r.engine.matchRecord()!;
  assert.deepEqual([record.gameId, record.totalRounds, record.impostorsCaught], ['likely', 2, 0]);
  assert.deepEqual(record.players.filter((p) => p.won).map((p) => p.playerId).sort(), ['ana', 'bia'], 'empate no topo: os dois vencem');
});

test('a sala sobrevive a salvar e restaurar no meio da votação', () => {
  const r = room(['ana', 'bia', 'caio']);
  r.engine.dispatch('ana', { type: 'startMatch' });
  const pergunta = r.view('ana').round!.questionId;
  r.engine.dispatch('ana', { type: 'openVoting' });
  r.engine.dispatch('bia', { type: 'castVote', targetId: 'caio' });

  const clock = fakeClock();
  const revived = RoomEngine.restore(r.engine.serialize(), { scheduler: clock.scheduler, rng: () => 0.42 });
  const view = (id: string) => revived.snapshotFor(id).game as LikelyView;
  assert.equal(view('ana').round!.questionId, pergunta);
  assert.equal(revived.snapshotFor('bia').votes!.myVote, 'caio', 'o voto já dado continua valendo');

  revived.dispatch('ana', { type: 'castVote', targetId: 'caio' });
  revived.dispatch('caio', { type: 'castVote', targetId: 'caio' });
  clock.advance(DEFAULT_ENGINE_CONFIG.allVotedPauseMs + DEFAULT_ENGINE_CONFIG.revealStage2Ms + 10);
  assert.deepEqual([view('ana').result!.winnerIds, view('ana').result!.unanimous], [['caio'], true]);
});

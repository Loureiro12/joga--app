import assert from 'node:assert/strict';
import { test } from 'node:test';

import { QUESTIONS } from '../src/games/perfect-questions';
import {
  DEFAULT_ENGINE_CONFIG,
  PERFECT_CATEGORIES,
  PERFECT_LENGTHS,
  PERFECT_TIMERS,
  RoomEngine,
  RoomError,
  SPICY_CATEGORY,
  countPerfectQuestions,
  sanitizePerfectSettings,
  type GameView,
  type PerfectSettings,
  type PlayerId,
  type Scheduler,
} from '../src/index';

type PerfectView = Extract<GameView, { kind: 'perfect' }>;

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
    for (let guard = 0; guard < 400; guard++) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = Math.max(now, due[1].at);
      due[1].fn();
    }
    now = target;
  };
  return { scheduler, advance, at: () => now };
}

const seeded = (seed: number) => {
  let x = seed;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
};

const NOMES = ['ana', 'bia', 'caio', 'duda', 'edu', 'fê'];

function sala(quantos = 4, totalRounds = 4, settings: Partial<PerfectSettings> = {}, seed = 7) {
  const nomes = NOMES.slice(0, quantos);
  const clock = fakeClock();
  const [host, ...guests] = nomes;
  const engine = RoomEngine.create(
    '4827',
    { gameId: 'perfect', category: 'Misturado', totalRounds, maxPlayers: 12, settings },
    { id: host, name: host, color: '#7C3AED' },
    { scheduler: clock.scheduler, rng: seeded(seed) },
  );
  for (const g of guests) engine.join({ id: g, name: g, color: '#FACC15' });
  const view = (id: PlayerId) => engine.snapshotFor(id).game as PerfectView;
  return { engine, clock, view, host, guests, all: nomes };
}

/** Forma os casais aos pares, na ordem: (ana,bia), (caio,duda), (edu,fê). */
function parear(r: ReturnType<typeof sala>) {
  r.engine.dispatch(r.host, { type: 'startMatch' });
  for (let i = 0; i < r.all.length; i += 2) {
    r.engine.dispatch(r.all[i], { type: 'pairWith', targetId: r.all[i + 1] });
    r.engine.dispatch(r.all[i + 1], { type: 'pairWith', targetId: r.all[i] });
  }
  return r;
}

/** Sala pareada e já na primeira pergunta. */
function partida(quantos = 4, totalRounds = 4, settings: Partial<PerfectSettings> = {}, seed = 7) {
  const r = parear(sala(quantos, totalRounds, settings, seed));
  r.engine.dispatch(r.host, { type: 'beginQuestions' });
  return r;
}

type Round = NonNullable<PerfectView['round']>;

/** O primeiro de cada dupla, na ordem em que `parear` forma os casais. */
const PRIMEIRO = new Set(['ana', 'caio', 'edu']);

/**
 * Responde por todos e roda a revelação até o fim.
 *
 * O escolhedor recebe a rodada porque "responder igual" depende da mecânica: em "quem é mais",
 * marcar a mesma opção é justamente apontar para pessoas diferentes.
 */
function rodada(r: ReturnType<typeof sala>, escolha: (id: PlayerId, round: Round) => string | null) {
  for (const id of r.all) {
    const round = r.view(id).round;
    if (!round) continue;
    const valor = escolha(id, round);
    if (valor) r.engine.dispatch(id, { type: 'submitAnswer', value: valor });
  }
  r.clock.advance(DEFAULT_ENGINE_CONFIG.allVotedPauseMs + DEFAULT_ENGINE_CONFIG.revealStage2Ms + 10);
  return r.view(r.host).result!;
}

/** Respostas que dão match em qualquer mecânica. */
const combinam = (id: PlayerId, round: Round): string =>
  round.type === 'who' ? (PRIMEIRO.has(id) ? 'self' : 'partner') : round.options[0].id;

/** Respostas que erram feio — nem o "quase" da escala. */
const discordam = (id: PlayerId, round: Round): string =>
  round.type === 'who' ? 'self' : round.options[PRIMEIRO.has(id) ? 0 : round.type === 'scale' ? 3 : 1].id;

const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof RoomError, `esperava RoomError, veio ${e}`);
    return e.code;
  }
  assert.fail('deveria ter lançado');
};

/* ----------------------------------------------------------------- perguntas */

test('banco de perguntas: sem repetição, com opções onde precisa e nada fora do combinado', () => {
  assert.equal(QUESTIONS.length, 140);
  const ids = QUESTIONS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, 'id repetido');
  assert.equal(new Set(QUESTIONS.map((q) => q.text)).size, QUESTIONS.length, 'pergunta repetida');

  for (const q of QUESTIONS) {
    assert.ok((PERFECT_CATEGORIES as readonly string[]).includes(q.category), `${q.id} tem categoria inválida`);
    assert.ok(q.text.endsWith('?') || q.text.endsWith(':'), `"${q.text}" não é pergunta nem abre opções`);
    assert.equal(q.text[0], q.text[0].toUpperCase(), `"${q.text}" não começa em maiúscula`);

    if (q.type === 'same' || q.type === 'know') {
      assert.ok((q.options ?? []).length >= 2, `${q.id} é de escolha e não tem opções`);
      assert.equal(new Set(q.options!.map((o) => o.id)).size, q.options!.length, `${q.id} tem opção repetida`);
    } else {
      assert.equal(q.options, undefined, `${q.id} não deveria trazer opções: elas são montadas por jogador`);
    }
    // Sem o segundo texto, quem tenta prever leria a pergunta como se fosse sobre si.
    if (q.type === 'know') assert.ok(q.predictText?.includes('{nome}'), `${q.id} não tem o texto de previsão com o nome do par`);
    else assert.equal(q.predictText, undefined);
    if (q.type === 'scale') assert.ok(q.scale, `${q.id} é escala e não diz o que são o 1 e o 5`);
  }

  // Marcação de gênero entre parênteses fica feia de ler em voz alta.
  for (const q of QUESTIONS) assert.ok(!/\((a|o)\)|\/(a|o)\b/i.test(q.text), `"${q.text}" marca gênero entre parênteses`);
});

test('cada categoria dá partida sozinha, e a picante não entra sem ser chamada', () => {
  for (const category of PERFECT_CATEGORIES) {
    const quantas = countPerfectQuestions(sanitizePerfectSettings({ categories: [category] }));
    // A partida mais curta são 10 perguntas: menos que isso e a categoria sozinha repetiria.
    assert.ok(quantas >= 10, `${category} só tem ${quantas} perguntas — uma "Rapidinha" repetiria`);
  }

  // Sem escolher nada, o "Misturado" é tudo menos a categoria apimentada (§21–22).
  const padrao = sanitizePerfectSettings(undefined);
  assert.equal(padrao.categories.length, 0);
  assert.equal(countPerfectQuestions(padrao), QUESTIONS.filter((q) => q.category !== SPICY_CATEGORY).length);
  assert.ok(countPerfectQuestions(padrao) < QUESTIONS.length, 'a categoria picante entrou no misturado');

  // E entra assim que o host marcar.
  assert.ok(countPerfectQuestions(sanitizePerfectSettings({ categories: [SPICY_CATEGORY] })) >= 10);
});

test('as opções do host são entrada de rede: vêm saneadas ou não vêm', () => {
  const limpo = sanitizePerfectSettings({ categories: ['Comida', 'Inventada' as never], timerSec: 7 });
  assert.deepEqual(limpo.categories, ['Comida']);
  assert.equal(limpo.timerSec, 20, 'tempo fora das opções deveria cair no padrão');
  assert.ok((PERFECT_TIMERS as readonly number[]).includes(sanitizePerfectSettings({ timerSec: 0 }).timerSec));
  assert.ok((PERFECT_LENGTHS as readonly number[]).includes(20));
  assert.deepEqual(sanitizePerfectSettings({ categories: 'Comida' as never }).categories, []);
});

/* ---------------------------------------------------------------- pareamento */

test('a dupla só existe com os dois lados: convite não basta', () => {
  const r = sala(4);
  r.engine.dispatch(r.host, { type: 'startMatch' });
  assert.equal(r.engine.phase, 'pairing', 'começar abre a formação das duplas, não a primeira pergunta');

  r.engine.dispatch('ana', { type: 'pairWith', targetId: 'bia' });
  assert.equal(r.view('ana').couples.length, 0, 'convite sozinho virou casal');
  assert.equal(r.view('ana').pairing!.invited, 'bia');
  assert.deepEqual(r.view('bia').pairing!.invitedBy, ['ana'], 'bia não foi avisada do convite');
  // E o convite não vaza para quem não tem nada com isso.
  assert.deepEqual(r.view('caio').pairing!.invitedBy, []);

  r.engine.dispatch('bia', { type: 'pairWith', targetId: 'ana' });
  const casais = r.view('ana').couples;
  assert.equal(casais.length, 1);
  assert.deepEqual([casais[0].aId, casais[0].bId].sort(), ['ana', 'bia']);
  assert.equal(r.view('ana').myCoupleId, casais[0].id);
  assert.equal(r.view('caio').myCoupleId, null);

  // Quem já tem par não entra em outro.
  assert.equal(code(() => r.engine.dispatch('caio', { type: 'pairWith', targetId: 'ana' })), 'bad_request');
  assert.equal(code(() => r.engine.dispatch('ana', { type: 'pairWith', targetId: 'ana' })), 'bad_request');

  // Desfazer devolve os dois para a fila.
  r.engine.dispatch('ana', { type: 'unpair' });
  assert.equal(r.view('ana').couples.length, 0);
  assert.deepEqual(r.view('bia').pairing!.waiting.sort(), ['ana', 'bia', 'caio', 'duda']);
});

test('ninguém fica de fora: a partida não começa com alguém sem par', () => {
  const r = sala(5);
  r.engine.dispatch(r.host, { type: 'startMatch' });
  r.engine.dispatch('ana', { type: 'pairWith', targetId: 'bia' });
  r.engine.dispatch('bia', { type: 'pairWith', targetId: 'ana' });
  r.engine.dispatch('caio', { type: 'pairWith', targetId: 'duda' });
  r.engine.dispatch('duda', { type: 'pairWith', targetId: 'caio' });

  // "edu" está na sala e sem par: a rodada esperaria por uma resposta que nunca vem.
  assert.equal(code(() => r.engine.dispatch(r.host, { type: 'beginQuestions' })), 'not_enough_players');
  assert.deepEqual(r.view(r.host).pairing!.waiting, ['edu']);

  r.engine.leave('edu');
  r.engine.dispatch(r.host, { type: 'beginQuestions' });
  assert.equal(r.engine.phase, 'answering');
});

test('só o host começa as perguntas', () => {
  const r = parear(sala(4));
  assert.equal(code(() => r.engine.dispatch('bia', { type: 'beginQuestions' })), 'not_host');
});

/* -------------------------------------------------------------- a resposta */

test('a resposta de um não chega no celular do outro antes da revelação', () => {
  const r = partida(4);
  r.engine.dispatch('ana', { type: 'submitAnswer', value: r.view('ana').round!.options[0].id });

  const naRede = JSON.stringify(r.engine.snapshotFor('bia'));
  assert.ok(!naRede.includes('"answers"'), 'o snapshot carrega o mapa de respostas');
  assert.equal(r.view('bia').myAnswer, null, 'bia recebeu resposta que não é dela');
  assert.equal(r.view('ana').myAnswer, r.view('ana').round!.options[0].id, 'o próprio jogador precisa ver o que marcou');

  // A sala diz quantos já responderam, nunca o quê (§69).
  const votos = r.engine.snapshotFor('bia').votes!;
  assert.deepEqual(votos.votedIds, ['ana']);
  assert.equal(votos.total, 4);
  assert.equal(votos.myVote, null);
});

test('resposta enviada não muda de ideia', () => {
  const r = partida(4);
  const opcoes = r.view('ana').round!.options;
  r.engine.dispatch('ana', { type: 'submitAnswer', value: opcoes[0].id });
  r.engine.dispatch('ana', { type: 'submitAnswer', value: opcoes[1].id });
  assert.equal(r.view('ana').myAnswer, opcoes[0].id, 'deu para trocar depois de confirmar');
  // Opção que não existe é recusada — de quem ainda não respondeu, porque a de quem já respondeu é ignorada.
  assert.equal(code(() => r.engine.dispatch('bia', { type: 'submitAnswer', value: 'inventado' })), 'bad_request');
});

test('"quem é mais" compara a pessoa, não a palavra', () => {
  // Ana marca "Carol" (o par) e Carol marca "Eu": as duas apontaram para a mesma pessoa (§25).
  const r = partida(4, 4, { categories: ['Dia a dia'] });
  while (r.view('ana').round!.type !== 'who') r.engine.dispatch(r.host, { type: 'skipQuestion' });

  const resultado = rodada(r, (id) => (id === 'ana' ? 'partner' : 'self'));
  const anaBia = resultado.couples.find((c) => c.coupleId === r.view('ana').myCoupleId)!;
  assert.equal(anaBia.outcome, 'match', 'apontar a mesma pessoa com palavras diferentes tem de dar match');
  assert.deepEqual(anaBia.answers.map((a) => a.label), ['bia', 'bia'], 'a revelação mostra a pessoa escolhida');
  // O id vai junto para o celular de cada um poder dizer "Você" no lugar do próprio nome.
  assert.deepEqual(anaBia.answers.map((a) => a.chosenId), ['bia', 'bia']);

  // O outro casal marcou "Eu" os dois: cada um apontou para si, que são pessoas diferentes.
  const outro = resultado.couples.find((c) => c.coupleId !== anaBia.coupleId)!;
  assert.equal(outro.outcome, 'miss');
  assert.equal(outro.points, 0);
});

test('a escala tem o quase: errar por um ponto vale metade', () => {
  const r = partida(4, 4, { categories: ['Quem conhece melhor'] });
  while (r.view('ana').round!.type !== 'scale') r.engine.dispatch(r.host, { type: 'skipQuestion' });

  const escolhas: Record<string, string> = { ana: '4', bia: '5', caio: '2', duda: '5' };
  const resultado = rodada(r, (id) => escolhas[id]);
  const casalDaAna = resultado.couples.find((c) => c.coupleId === r.view('ana').myCoupleId)!;
  assert.equal(casalDaAna.outcome, 'close', '4 e 5 é quase');
  assert.equal(casalDaAna.points, 50);
  // Fora de "quem é mais" a resposta é uma opção, não uma pessoa.
  assert.deepEqual(casalDaAna.answers.map((a) => a.chosenId), [null, null]);

  const outro = resultado.couples.find((c) => c.coupleId !== casalDaAna.coupleId)!;
  assert.equal(outro.outcome, 'miss', '2 e 5 não é quase nada');
  assert.equal(outro.points, 0);
});

test('em "conheça seu parceiro" um responde sobre si e o outro tenta prever, alternando', () => {
  const r = partida(4, 6, { categories: ['Quem conhece melhor'] });
  while (r.view('ana').round!.type !== 'know') r.engine.dispatch(r.host, { type: 'skipQuestion' });

  const primeira = r.view('ana').round!;
  const alvo = primeira.aboutId!;
  assert.ok(['ana', 'bia'].includes(alvo));
  // Quem responde sobre si lê a pergunta na primeira pessoa; quem prevê lê o nome do outro.
  const doOutro = r.view(alvo === 'ana' ? 'bia' : 'ana').round!;
  assert.notEqual(primeira.prompt, doOutro.prompt, 'os dois leram exatamente a mesma coisa');
  assert.ok(doOutro.prompt.includes(alvo) || primeira.prompt.includes(alvo), 'o nome do alvo não apareceu para quem prevê');
  assert.ok(!doOutro.prompt.includes('{nome}'), 'o nome não foi substituído no texto');

  const resultado = rodada(r, (id, round) => (['ana', 'bia'].includes(id) ? combinam(id, round) : discordam(id, round)));
  assert.equal(resultado.couples.find((c) => c.coupleId === r.view('ana').myCoupleId)!.outcome, 'match');

  // Na próxima pergunta de previsão, a vez é do outro (§28).
  r.engine.dispatch(r.host, { type: 'nextRound' });
  while (r.view('ana').round!.type !== 'know') r.engine.dispatch(r.host, { type: 'skipQuestion' });
  assert.notEqual(r.view('ana').round!.aboutId, alvo, 'a mesma pessoa foi alvo duas vezes seguidas');
});

test('quem não responde não segura a mesa, e fica sem match', () => {
  const r = partida(4, 4, { timerSec: 15 });
  r.engine.dispatch('ana', { type: 'submitAnswer', value: r.view('ana').round!.options[0].id });
  r.engine.dispatch('caio', { type: 'submitAnswer', value: r.view('caio').round!.options[0].id });
  r.engine.dispatch('duda', { type: 'submitAnswer', value: r.view('duda').round!.options[0].id });

  // O cronômetro fecha a rodada com o que houver (§34).
  assert.equal(r.engine.phase, 'answering');
  r.clock.advance(15_000 + DEFAULT_ENGINE_CONFIG.allVotedPauseMs + DEFAULT_ENGINE_CONFIG.revealStage2Ms + 10);
  assert.equal(r.engine.phase, 'revealing');

  const casalDaAna = r.view('ana').result!.couples.find((c) => c.coupleId === r.view('ana').myCoupleId)!;
  assert.equal(casalDaAna.outcome, 'miss');
  assert.ok(casalDaAna.answers.some((a) => a.missing), 'a revelação não marcou quem ficou sem responder');
});

/* -------------------------------------------------------------- a revelação */

test('a revelação chega em tempos: primeiro a espera, depois as respostas, depois os pontos', () => {
  const r = partida(4, 4);
  for (const id of r.all) r.engine.dispatch(id, { type: 'submitAnswer', value: r.view(id).round!.options[0].id });

  r.clock.advance(DEFAULT_ENGINE_CONFIG.allVotedPauseMs + 5);
  assert.equal(r.engine.phase, 'revealing');
  assert.equal(r.view('ana').result!.stage, 0);
  assert.deepEqual(r.view('ana').result!.couples, [], 'a resposta apareceu antes da hora');

  r.clock.advance(DEFAULT_ENGINE_CONFIG.revealStage1Ms);
  assert.equal(r.view('ana').result!.stage, 1);
  assert.equal(r.view('ana').result!.couples.length, 2);
  assert.equal(r.engine.snapshotFor('ana').scores.find((s) => s.playerId === 'ana')!.points, 0, 'o ponto entrou antes do tempo 2');

  r.clock.advance(DEFAULT_ENGINE_CONFIG.revealStage2Ms);
  assert.equal(r.view('ana').result!.stage, 2);
  assert.equal(r.engine.snapshotFor('ana').scores.find((s) => s.playerId === 'ana')!.points, 100);
  // Os dois do casal carregam a mesma pontuação: o placar da sala é por jogador, o jogo é por casal.
  assert.equal(r.engine.snapshotFor('bia').scores.find((s) => s.playerId === 'bia')!.points, 100);
});

test('o placar aparece de cinco em cinco e some nas três últimas perguntas', () => {
  const r = partida(4, 12);
  const vistos: number[] = [];
  for (let i = 1; i <= 12; i++) {
    const resultado = rodada(r, combinam);
    if (resultado.standings) vistos.push(i);
    if (i < 12) r.engine.dispatch(r.host, { type: 'nextRound' });
  }
  // 5 e 10 mostram; 10 é a antepenúltima de 12, então some — restam 5.
  assert.deepEqual(vistos, [5], `placar apareceu nas rodadas ${vistos.join(',')}`);
});

test('match final vale dobro', () => {
  const r = partida(4, 3);
  for (let i = 1; i <= 3; i++) {
    const round = r.view('ana').round!;
    assert.equal(round.final, i === 3, `a rodada ${i} se declarou final errado`);
    assert.equal(round.points, i === 3 ? 200 : round.double ? 200 : 100);
    // Um casal acerta e o outro não: empate no topo abriria desempate e a partida não fecharia aqui.
    rodada(r, (id, round) => (['ana', 'bia'].includes(id) ? combinam(id, round) : discordam(id, round)));
    if (i < 3) r.engine.dispatch(r.host, { type: 'nextRound' });
  }
  r.engine.dispatch(r.host, { type: 'nextRound' });
  assert.equal(r.engine.phase, 'finished');
});

/* -------------------------------------------------------------------- o fim */

test('o fim conta a partida do casal — e a estatística não vira laudo', () => {
  const r = partida(4, 4, { categories: ['Dia a dia'] });
  const meuCasal = r.view('ana').myCoupleId!;
  // Ana e Bia combinam sempre; Caio e Duda, nunca.
  for (let i = 1; i <= 4; i++) {
    rodada(r, (id, round) => (['ana', 'bia'].includes(id) ? combinam(id, round) : discordam(id, round)));
    r.engine.dispatch(r.host, { type: 'nextRound' });
  }
  assert.equal(r.engine.phase, 'finished');

  const resumo = r.view('ana').summary!;
  assert.equal(resumo.standings[0].coupleId, meuCasal);
  assert.equal(resumo.standings[0].matches, 4);
  assert.equal(resumo.standings[0].points, 400);
  assert.equal(resumo.percent, 50, 'quatro matches em oito respostas de casal é metade');

  assert.equal(resumo.mine!.matches, 4);
  assert.equal(resumo.mine!.bestStreak, 4);
  assert.equal(resumo.mine!.agreed.length, 4, 'faltou o "vocês combinaram em..."');
  assert.equal(resumo.mine!.disagreed.length, 0);

  // Cada um vê o resumo do PRÓPRIO casal.
  assert.equal(r.view('caio').summary!.mine!.coupleId, r.view('caio').myCoupleId);
  assert.equal(r.view('caio').summary!.mine!.matches, 0);
  assert.equal(r.view('caio').summary!.mine!.disagreed.length, 4);

  const titulos = resumo.titles.map((t) => t.key);
  assert.ok(titulos.includes('sintonia') || titulos.includes('sequencia'), 'quatro matches seguidos e nenhum título de sequência');
  // O título do casal que menos combinou existe, mas é piada — nunca um veredito sobre a relação.
  const planeta = resumo.titles.find((t) => t.key === 'planetas');
  assert.ok(planeta && planeta.coupleId !== meuCasal);
  for (const t of resumo.titles) assert.ok(!/compat|problema|melhor casal|de verdade/i.test(t.detail), `título com veredito: ${t.detail}`);
});

test('empate no topo abre desempate, e vence a menor diferença interna', () => {
  const r = partida(4, 2, { categories: ['Dia a dia'] });
  // Os dois casais combinam em tudo: terminam empatados.
  for (let i = 1; i <= 2; i++) {
    rodada(r, combinam);
    r.engine.dispatch(r.host, { type: 'nextRound' });
  }
  assert.equal(r.engine.phase, 'answering', 'empate no topo deveria abrir o desempate');
  const round = r.view('ana').round!;
  assert.equal(round.tieBreak, true);
  assert.equal(round.type, 'scale', 'o desempate precisa de número para medir a diferença');

  // Ana/Bia ficam a 1 de distância; Caio/Duda, a 3.
  const escolhas: Record<string, string> = { ana: '3', bia: '4', caio: '1', duda: '4' };
  rodada(r, (id) => escolhas[id]);
  r.engine.dispatch(r.host, { type: 'nextRound' });

  assert.equal(r.engine.phase, 'finished');
  assert.equal(r.view('ana').summary!.standings[0].coupleId, r.view('ana').myCoupleId, 'o desempate não decidiu a ponta');
});

test('sem empate no topo, a partida acaba sem desempate nenhum', () => {
  const r = partida(4, 2, { categories: ['Dia a dia'] });
  for (let i = 1; i <= 2; i++) {
    rodada(r, (id, round) => (['ana', 'bia'].includes(id) ? combinam(id, round) : discordam(id, round)));
    r.engine.dispatch(r.host, { type: 'nextRound' });
  }
  assert.equal(r.engine.phase, 'finished');
});

/* -------------------------------------------------------- sala e imprevistos */

test('quem sai leva o casal junto, e a rodada continua sem eles', () => {
  const r = partida(6, 4);
  assert.equal(r.view('ana').couples.length, 3);

  r.engine.leave('edu');
  const depois = r.view('ana');
  assert.equal(depois.couples.length, 2, 'o casal de quem saiu continuou na disputa sem ter como responder');
  assert.equal(r.view('fê').myCoupleId, null, 'quem ficou sem par continuou preso ao casal');

  // A mesa segue: os quatro restantes respondem e a rodada fecha.
  for (const id of ['ana', 'bia', 'caio', 'duda']) r.engine.dispatch(id, { type: 'submitAnswer', value: r.view(id).round!.options[0].id });
  r.clock.advance(DEFAULT_ENGINE_CONFIG.allVotedPauseMs + DEFAULT_ENGINE_CONFIG.revealStage2Ms + 10);
  assert.equal(r.engine.phase, 'revealing');
  assert.equal(r.view('ana').result!.couples.length, 2);
});

test('a pergunta pode ser pulada antes da primeira resposta, e não depois', () => {
  const r = partida(4);
  const antes = r.view('ana').round!.questionId;
  r.engine.dispatch(r.host, { type: 'skipQuestion' });
  assert.notEqual(r.view('ana').round!.questionId, antes, 'pular trouxe a mesma pergunta');

  r.engine.dispatch('ana', { type: 'submitAnswer', value: r.view('ana').round!.options[0].id });
  // Depois de alguém responder, trocar a pergunta seria escolher o resultado.
  assert.equal(code(() => r.engine.dispatch(r.host, { type: 'skipQuestion' })), 'invalid_phase');
});

test('a pergunta não se repete na mesma partida', () => {
  const r = partida(4, 12, { categories: ['Dia a dia'] });
  const vistas: string[] = [];
  for (let i = 1; i <= 12; i++) {
    vistas.push(r.view('ana').round!.questionId);
    rodada(r, combinam);
    if (i < 12) r.engine.dispatch(r.host, { type: 'nextRound' });
  }
  assert.equal(new Set(vistas).size, 12, 'pergunta repetida na mesma partida');
});

test('jogar de novo devolve a sala ao lobby, sem casal e sem ponto', () => {
  const r = partida(4, 1);
  rodada(r, (id, round) => (['ana', 'bia'].includes(id) ? combinam(id, round) : discordam(id, round)));
  r.engine.dispatch(r.host, { type: 'nextRound' });
  assert.equal(r.engine.phase, 'finished');

  r.engine.dispatch(r.host, { type: 'playAgain' });
  assert.equal(r.engine.phase, 'lobby');
  assert.deepEqual(r.view('ana').couples, [], 'as duplas anteriores sobreviveram ao reinício');
  assert.ok(r.engine.snapshotFor('ana').scores.every((s) => s.points === 0));
});

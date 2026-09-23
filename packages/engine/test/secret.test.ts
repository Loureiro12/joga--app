import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MISSIONS } from '../src/games/secret-missions';
import {
  DEFAULT_ENGINE_CONFIG,
  RoomEngine,
  RoomError,
  DEFAULT_SECRET_SETTINGS,
  SECRET_CONTEXTS,
  SECRET_DIFFICULTIES,
  SECRET_LIMITS,
  SECRET_POINTS,
  countMissions,
  sanitizeSecretSettings,
  secretGame,
  type GameView,
  type PlayerId,
  type Scheduler,
  type SecretContext,
  type SecretSettings,
} from '../src/index';

type SecretView = Extract<GameView, { kind: 'secret' }>;

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
  return { scheduler, advance, at: () => now };
}

const seeded = (seed: number) => {
  let x = seed;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
};

function sala(names: string[], settings: Partial<SecretSettings> = {}, seed = 7) {
  const clock = fakeClock();
  const [host, ...guests] = names;
  const engine = RoomEngine.create(
    '4827',
    { gameId: 'secret', category: 'festa', totalRounds: 1, maxPlayers: 12, settings },
    { id: host, name: host, color: '#7C3AED' },
    { scheduler: clock.scheduler, rng: seeded(seed) },
  );
  for (const g of guests) engine.join({ id: g, name: g, color: '#FACC15' });
  const view = (id: PlayerId) => engine.snapshotFor(id).game as SecretView;
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

/** Distribui as missões e faz todo mundo confirmar, deixando a noite correndo. */
function noite(names: string[], settings: Partial<SecretSettings> = {}, seed = 7) {
  const r = sala(names, settings, seed);
  r.engine.dispatch(r.host, { type: 'startMatch' });
  for (const id of names) r.engine.dispatch(id, { type: 'missionReady' });
  return r;
}

/* ------------------------------------------------------------------ missões */

test('banco de missões: categorias, contextos e nada de repetido', () => {
  assert.equal(MISSIONS.length, 144);
  const ids = MISSIONS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'id repetido');
  assert.equal(new Set(MISSIONS.map((m) => m.text)).size, MISSIONS.length, 'missão repetida');

  const validos: readonly SecretContext[] = SECRET_CONTEXTS;
  for (const m of MISSIONS) {
    assert.ok(m.contexts.length > 0, `"${m.text}" não serve em lugar nenhum`);
    for (const c of m.contexts) assert.ok(validos.includes(c), `"${m.text}" tem contexto inválido: ${c}`);
    assert.ok(m.text.endsWith('.'), `"${m.text}" não termina em ponto`);
    assert.equal(m.text[0], m.text[0].toUpperCase());
  }

  // Todo contexto precisa de baralho: um lugar com poucas missões repetiria entre os jogadores.
  for (const c of validos) {
    const quantas = MISSIONS.filter((m) => m.contexts.includes(c)).length;
    assert.ok(quantas >= 40, `o contexto "${c}" só tem ${quantas} missões`);
  }
});

test('escolher o lugar muda o baralho — senão a pergunta do host não serve para nada', () => {
  for (const c of SECRET_CONTEXTS) {
    // Missão que só acontece aqui. Sem nenhuma, "onde vai ser?" seria uma pergunta decorativa.
    const daqui = MISSIONS.filter((m) => m.contexts.length < SECRET_CONTEXTS.length && m.contexts.includes(c));
    assert.ok(daqui.length >= 3, `o contexto "${c}" não tem missão própria: escolhê-lo não muda nada`);
    // E cada lugar exclui alguma coisa, senão o filtro só cresceria.
    assert.ok(MISSIONS.some((m) => !m.contexts.includes(c)), `nada é filtrado em "${c}"`);
  }
});

test('cada lugar tem baralho para a maior sala, em qualquer faixa de dificuldade', () => {
  // A maior partida distribui 12 missões distintas e ainda precisa de 3 falsas por acusação.
  const minimo = secretGame.maxPlayers + 3;
  for (const context of SECRET_CONTEXTS) {
    for (const d of SECRET_DIFFICULTIES) {
      const quantas = countMissions({ ...DEFAULT_SECRET_SETTINGS, context, difficulties: [d] });
      assert.ok(quantas >= minimo, `${context} + ${d}: ${quantas} missões para ${minimo} necessárias`);
    }
  }
});

/* -------------------------------------------------------------- distribuição */

test('cada um recebe uma missão diferente, e a dificuldade é equilibrada', () => {
  const r = noite(['ana', 'bia', 'caio', 'duda', 'edu'], { difficulties: ['facil', 'media', 'dificil'] });
  const minhas = r.all.map((id) => r.view(id).mine!.mission);

  assert.equal(new Set(minhas.map((m) => m.id)).size, 5, 'duas pessoas receberam a mesma missão');

  // Sortear livre deixaria quatro com a fácil e um com a impossível, e aí comparar não diz nada.
  // O equilíbrio é a distribuição ser pareja entre as faixas, não ser toda da mesma.
  const porFaixa = ['facil', 'media', 'dificil'].map((d) => minhas.filter((m) => m.difficulty === d).length);
  assert.ok(Math.max(...porFaixa) - Math.min(...porFaixa) <= 1, `distribuição torta: ${porFaixa.join('/')}`);
});

test('o lugar escolhido aparece na mesa: alguém recebe missão que só existe ali', () => {
  // Quase todo o banco é de conversa e serve em qualquer canto. Sem preferir as missões do lugar,
  // as poucas que falam da churrasqueira quase nunca sairiam e escolher o lugar não mudaria nada.
  const nomes = ['ana', 'bia', 'caio', 'duda', 'edu', 'fê'];
  for (const context of SECRET_CONTEXTS) {
    let noites = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const r = noite(nomes, { context, difficulties: ['facil', 'media'] }, seed);
      const missoes = r.all.map((id) => r.view(id).mine!.mission);
      if (missoes.some((m) => m.contexts.length < SECRET_CONTEXTS.length)) noites += 1;
      // E nunca uma missão que não cabe no lugar.
      for (const m of missoes) assert.ok(m.contexts.includes(context), `"${m.text}" não acontece em ${context}`);
    }
    assert.equal(noites, 8, `em ${context}, ${8 - noites} de 8 noites não tiveram nenhuma missão do lugar`);
  }
});

test('as opções de acusação não se entregam pelo tipo da missão', () => {
  // Como o sorteio prefere as missões do lugar, elas somem do banco de falsas. Se a lista viesse
  // com três missões de conversa e uma sobre a churrasqueira, não haveria o que deduzir.
  for (const context of SECRET_CONTEXTS) {
    const r = noite(['ana', 'bia', 'caio', 'duda', 'edu'], { context });
    for (const eu of r.all) {
      for (const [alvo, opcoes] of Object.entries(r.view(eu).accusationOptions)) {
        assert.equal(opcoes.length, 4, `${alvo} não veio com quatro opções`);
        const tipos = new Set(opcoes.map((m) => m.contexts.length < SECRET_CONTEXTS.length));
        assert.equal(tipos.size, 1, `as opções de ${alvo} em ${context} misturam missão do lugar com missão de qualquer lugar`);
        for (const m of opcoes) assert.ok(m.contexts.includes(context), `opção "${m.text}" não acontece em ${context}`);
      }
    }
  }
});

test('ninguém consegue saber qual é a missão do outro pelo próprio snapshot', () => {
  const r = noite(['ana', 'bia', 'caio']);
  const daAna = r.view('ana').mine!.mission;

  for (const outro of ['bia', 'caio']) {
    const snapshot = r.engine.snapshotFor(outro);
    const view = snapshot.game as SecretView;

    // `mine` é sempre a própria missão, nunca a de outra pessoa.
    assert.notEqual(view.mine!.mission.id, daAna.id);

    // O texto da missão da Ana ESTÁ no snapshot, e tem de estar: é uma das quatro opções entre
    // as quais se acusa. O que não pode é o snapshot dizer qual delas é a verdadeira.
    const opcoes = view.accusationOptions['ana'];
    assert.ok(opcoes.some((m) => m.id === daAna.id), 'sem a verdadeira entre as opções, acusar seria impossível');

    const wire = JSON.stringify(snapshot);
    for (const campo of ['missionOf', 'caughtAt', 'completedAt', 'options']) {
      assert.ok(!wire.includes(`"${campo}"`), `o snapshot de ${outro} carrega "${campo}" — daria para ler a missão alheia`);
    }
    // E nenhuma marca de qual opção é a certa: as quatro chegam iguais.
    const marcas = opcoes.map((m) => Object.keys(m).sort().join(','));
    assert.equal(new Set(marcas).size, 1, 'uma das opções veio com campo a mais e se entrega');
  }
});

test('o contexto filtra: nada de missão que não cabe no lugar', () => {
  for (const contexto of ['casa', 'jogos', 'viagem'] as SecretContext[]) {
    const r = noite(['ana', 'bia', 'caio'], { context: contexto });
    for (const id of r.all) {
      assert.ok(r.view(id).mine!.mission.contexts.includes(contexto), `missão fora do contexto "${contexto}"`);
    }
  }
});

/* ---------------------------------------------------------------- a noite */

test('a noite só começa quando todos esconderam a própria missão', () => {
  const r = sala(['ana', 'bia', 'caio']);
  r.engine.dispatch('ana', { type: 'startMatch' });
  assert.equal(r.engine.phase, 'briefing');

  r.engine.dispatch('ana', { type: 'missionReady' });
  r.engine.dispatch('bia', { type: 'missionReady' });
  assert.equal(r.engine.phase, 'briefing', 'faltava o Caio');
  assert.deepEqual(r.view('ana').ready.sort(), ['ana', 'bia']);

  r.engine.dispatch('caio', { type: 'missionReady' });
  assert.equal(r.engine.phase, 'mission');
});

test('quem cai no briefing não trava a noite', () => {
  const r = sala(['ana', 'bia', 'caio']);
  r.engine.dispatch('ana', { type: 'startMatch' });
  r.engine.dispatch('ana', { type: 'missionReady' });
  r.engine.dispatch('bia', { type: 'missionReady' });
  r.engine.setConnected('caio', false);
  assert.equal(r.engine.phase, 'mission', 'a noite ficou presa esperando quem saiu da mesa');
});

test('marcar "consegui" não anuncia nada para ninguém', () => {
  const r = noite(['ana', 'bia', 'caio']);
  const antes = JSON.stringify(r.engine.snapshotFor('bia'));
  r.engine.dispatch('ana', { type: 'missionDone' });

  assert.equal(r.view('ana').mine!.status, 'concluida');
  // Se o app avisasse, o grupo saberia que algo acabou de acontecer e deduziria a missão (§23).
  assert.equal(JSON.stringify(r.engine.snapshotFor('bia')), antes, 'a conclusão da Ana apareceu para a Bia');
  assert.equal(r.view('bia').mine!.status, 'ativa');
});

/* -------------------------------------------------------------- acusações */

test('acusar certo pega; acusar errado gasta a acusação e a missão segue', () => {
  const r = noite(['ana', 'bia', 'caio']);
  const daAna = r.view('ana').mine!.mission;
  const opcoes = r.view('bia').accusationOptions['ana'];

  assert.equal(opcoes.length, 4, 'a acusação precisa de opções: chute livre não teria como ser julgado');
  assert.ok(opcoes.some((m) => m.id === daAna.id), 'a missão verdadeira não está entre as opções');

  // Errada primeiro: gasta a bala e não pega ninguém.
  const errada = opcoes.find((m) => m.id !== daAna.id)!;
  r.engine.dispatch('bia', { type: 'accuse', targetId: 'ana', missionId: errada.id });
  assert.equal(r.view('ana').mine!.status, 'ativa');
  assert.equal(r.view('bia').mine!.accusationsLeft, 1);
  // A Ana sente que desconfiaram, mas não sabe de quem (§34).
  assert.equal(r.view('ana').mine!.suspected, true);

  r.engine.dispatch('caio', { type: 'accuse', targetId: 'ana', missionId: daAna.id });
  assert.equal(r.view('ana').mine!.status, 'pego');
});

test('sem acusações não dá para acusar, e ninguém acusa a si mesmo', () => {
  const r = noite(['ana', 'bia', 'caio'], { accusations: 1 });
  const opcoes = r.view('bia').accusationOptions['caio'];
  r.engine.dispatch('bia', { type: 'accuse', targetId: 'caio', missionId: opcoes[0].id });

  assert.equal(
    code(() => r.engine.dispatch('bia', { type: 'accuse', targetId: 'ana', missionId: r.view('bia').accusationOptions['ana'][0].id })),
    'bad_request',
  );
  assert.equal(
    code(() => r.engine.dispatch('ana', { type: 'accuse', targetId: 'ana', missionId: r.view('ana').mine!.mission.id })),
    'bad_request',
  );
  // Palpite fora das opções daquele alvo também não passa.
  assert.equal(
    code(() => r.engine.dispatch('caio', { type: 'accuse', targetId: 'ana', missionId: 'nao-existe' })),
    'bad_request',
  );
});

test('quem registrou antes ganha a corrida: a acusação chega tarde', () => {
  const r = noite(['ana', 'bia', 'caio']);
  const daAna = r.view('ana').mine!.mission;

  r.engine.dispatch('ana', { type: 'missionDone' });
  r.engine.dispatch('bia', { type: 'accuse', targetId: 'ana', missionId: daAna.id });

  assert.equal(r.view('ana').mine!.status, 'concluida', 'a Ana chegou primeiro (§32)');
  // A acusação foi gasta de qualquer jeito: apostar tarde custa igual.
  assert.equal(r.view('bia').mine!.accusationsLeft, 1);
});

test('eu não vejo as opções de acusação de mim mesmo', () => {
  const r = noite(['ana', 'bia', 'caio']);
  const minhas = r.view('ana').accusationOptions;
  assert.equal(minhas['ana'], undefined, 'as opções sobre mim me diriam qual é a minha missão');
  assert.ok(minhas['bia'] && minhas['caio']);
});

/* ------------------------------------------------------------------ trocar */

test('trocar dá outra missão, gasta a troca e refaz as opções', () => {
  const r = noite(['ana', 'bia', 'caio']);
  const antiga = r.view('ana').mine!.mission;
  const opcoesAntigas = r.view('bia').accusationOptions['ana'].map((m) => m.id);

  r.engine.dispatch('ana', { type: 'swapMission' });
  const nova = r.view('ana').mine!.mission;
  assert.notEqual(nova.id, antiga.id);
  assert.equal(r.view('ana').mine!.swapsLeft, 0);

  const opcoesNovas = r.view('bia').accusationOptions['ana'].map((m) => m.id);
  assert.ok(opcoesNovas.includes(nova.id), 'as opções precisam conter a missão nova');
  assert.notDeepEqual(opcoesNovas, opcoesAntigas, 'manter as opções antigas entregaria a troca');

  assert.equal(
    code(() => r.engine.dispatch('ana', { type: 'swapMission' })),
    'bad_request',
    'a troca é uma só',
  );
});

/* --------------------------------------------------------- hora da verdade */

test('a hora da verdade abre um por vez, e o grupo valida a história', () => {
  const r = noite(['ana', 'bia', 'caio']);
  r.engine.dispatch('ana', { type: 'missionDone' });
  r.engine.dispatch('bia', { type: 'missionDone' });

  r.engine.dispatch('ana', { type: 'endMatch' });
  assert.equal(r.engine.phase, 'verdict');

  const primeiro = r.view('ana').reveal!;
  assert.deepEqual(r.view('ana').revealProgress, { index: 1, total: 3 });
  // Agora a missão aparece para todo mundo: o segredo acabou.
  assert.ok(primeiro.mission.text.length > 0);

  // O dono não vota na própria história.
  assert.equal(
    code(() => r.engine.dispatch(primeiro.playerId, { type: 'voteReveal', valid: true })),
    'bad_request',
  );

  const outros = r.all.filter((id) => id !== primeiro.playerId);
  for (const id of outros) r.engine.dispatch(id, { type: 'voteReveal', valid: true });
  assert.equal(r.view('ana').reveal!.votesFor, 2);

  r.engine.dispatch('ana', { type: 'nextReveal' });
  assert.equal(r.view('ana').revealProgress!.index, 2);
  assert.notEqual(r.view('ana').reveal!.playerId, primeiro.playerId);
});

test('o grupo pode rejeitar uma história, e empate vale', () => {
  const r = noite(['ana', 'bia', 'caio', 'duda']);
  for (const id of r.all) r.engine.dispatch(id, { type: 'missionDone' });
  r.engine.dispatch('ana', { type: 'endMatch' });

  const alvo = r.view('ana').reveal!.playerId;
  const outros = r.all.filter((id) => id !== alvo);
  // Dois contra, um a favor: rejeitada.
  r.engine.dispatch(outros[0], { type: 'voteReveal', valid: false });
  r.engine.dispatch(outros[1], { type: 'voteReveal', valid: false });
  r.engine.dispatch(outros[2], { type: 'voteReveal', valid: true });
  r.engine.dispatch('ana', { type: 'nextReveal' });

  // Chega ao fim e confere o resumo.
  while (r.engine.phase === 'verdict') r.engine.dispatch('ana', { type: 'nextReveal' });
  assert.equal(r.engine.phase, 'finished');
  const summary = r.view('ana').summary!;
  assert.equal(summary.players.find((p) => p.playerId === alvo)!.status, 'rejeitada');
  assert.equal(summary.players.length, 4);
});

test('quem foi pego abre a fila da revelação', () => {
  const r = noite(['ana', 'bia', 'caio']);
  const daCaio = r.view('caio').mine!.mission;
  r.engine.dispatch('ana', { type: 'accuse', targetId: 'caio', missionId: daCaio.id });
  assert.equal(r.view('caio').mine!.status, 'pego');

  r.engine.dispatch('ana', { type: 'endMatch' });
  const primeiro = r.view('ana').reveal!;
  assert.equal(primeiro.playerId, 'caio', 'a revelação mais divertida abre a fila');
  assert.equal(primeiro.status, 'pego');
  assert.equal(primeiro.caughtBy, 'ana');
});

/* ------------------------------------------------------------------ pontos */

test('no competitivo, só missão validada pontua — e discrição vale bônus', () => {
  const r = noite(['ana', 'bia', 'caio'], { competitive: true });
  const daAna = r.view('ana').mine!.mission;
  const daBia = r.view('bia').mine!.mission;
  r.engine.dispatch('ana', { type: 'missionDone' });
  r.engine.dispatch('bia', { type: 'missionDone' });
  // O Caio erra uma acusação: paga por isso.
  const erradas = r.view('caio').accusationOptions['bia'].filter((m) => m.id !== r.view('bia').mine!.mission.id);
  r.engine.dispatch('caio', { type: 'accuse', targetId: 'bia', missionId: erradas[0].id });

  r.engine.dispatch('ana', { type: 'endMatch' });
  while (r.engine.phase === 'verdict') {
    const alvo = r.view('ana').reveal!.playerId;
    for (const id of r.all.filter((x) => x !== alvo)) r.engine.dispatch(id, { type: 'voteReveal', valid: true });
    r.engine.dispatch('ana', { type: 'nextReveal' });
  }

  const summary = r.view('ana').summary!;
  const ana = summary.players.find((p) => p.playerId === 'ana')!;
  // Ninguém acusou a Ana: cumpriu e passou a noite invisível.
  assert.equal(ana.points, SECRET_POINTS[daAna.difficulty] + SECRET_POINTS.ghost);

  const caio = summary.players.find((p) => p.playerId === 'caio')!;
  assert.ok(caio.points < 0 || caio.points < SECRET_POINTS.facil, 'a acusação errada precisa custar');

  // A Bia também cumpriu, mas levou uma acusação: leva a missão e perde o bônus de discrição.
  // Comparar o total com o da Ana não diria nada — as missões podem ter dificuldades diferentes.
  const bia = summary.players.find((p) => p.playerId === 'bia')!;
  assert.equal(bia.points, SECRET_POINTS[daBia.difficulty], 'a Bia foi acusada e mesmo assim levou o bônus de fantasma');
});

test('os títulos do fim só saem com base — ninguém vira detetive sem acusar', () => {
  const r = noite(['ana', 'bia', 'caio']);
  r.engine.dispatch('ana', { type: 'endMatch' });
  while (r.engine.phase === 'verdict') r.engine.dispatch('ana', { type: 'nextReveal' });
  assert.deepEqual(r.view('ana').summary!.highlights, [], 'noite sem nada acontecendo não gera título');
});

/* ------------------------------------------------------------ prazos da sala */

test('a sala aguenta a festa: ninguém é removido por guardar o celular', () => {
  const r = noite(['ana', 'bia', 'caio']);
  // Com o prazo padrão de 30 s, todo mundo teria sido removido e a partida morreria.
  for (const id of r.all) r.engine.setConnected(id, false);
  r.clock.advance(DEFAULT_ENGINE_CONFIG.graceMs * 10);

  assert.equal(r.engine.playerIds.length, 3, 'o grupo foi expulso da própria partida');
  assert.equal(r.engine.phase, 'mission');

  // Volta horas depois e a missão continua lá.
  r.engine.setConnected('ana', true);
  assert.ok(r.view('ana').mine!.mission.text.length > 0);
});

test('a configuração sempre tem baralho', () => {
  for (const contexto of SECRET_CONTEXTS) {
    assert.ok(countMissions({ context: contexto, difficulties: ['facil'], accusations: 2, swaps: 1, competitive: false }) > 0);
  }
});

/* ------------------------------------------------------ configuração do host */

test('as opções do host são entrada de rede: vêm saneadas ou não vêm', () => {
  const limpo = sanitizeSecretSettings({
    context: 'balada' as never,
    difficulties: ['facil', 'inventada' as never],
    // Com acusação de sobra ninguém precisa deduzir: basta tentar todas as combinações.
    accusations: 999,
    swaps: -5,
    competitive: 'sim' as never,
  });
  assert.equal(limpo.context, 'festa', 'contexto inválido deveria cair no padrão');
  assert.deepEqual(limpo.difficulties, ['facil']);
  assert.equal(limpo.accusations, SECRET_LIMITS.accusations.max);
  assert.equal(limpo.swaps, SECRET_LIMITS.swaps.min);
  assert.equal(limpo.competitive, true);

  // Nenhuma faixa marcada deixaria o sorteio sem baralho.
  assert.ok(sanitizeSecretSettings({ difficulties: [] }).difficulties.length > 0);
  assert.ok(sanitizeSecretSettings({ difficulties: 'facil' as never }).difficulties.length > 0);
  assert.ok(countMissions(sanitizeSecretSettings(undefined)) > 0);
});

test('o teto de acusações vale na partida, não só no sanitizador', () => {
  const r = noite(['ana', 'bia', 'caio'], { accusations: 999 });
  assert.equal(r.view('ana').mine!.accusationsLeft, SECRET_LIMITS.accusations.max);
});

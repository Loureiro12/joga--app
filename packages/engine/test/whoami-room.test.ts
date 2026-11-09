import assert from 'node:assert/strict';
import { test } from 'node:test';

import { IDENTITIES } from '../src/games/whoami-identities';
import {
  RoomEngine,
  RoomError,
  WHOAMI_HINTS,
  WHOAMI_POINTS,
  type CreateRoomInput,
  type GameView,
  type PlayerId,
  type Scheduler,
  type WhoamiSettings,
} from '../src/index';

type WhoamiView = Extract<GameView, { kind: 'whoami' }>;

/**
 * Quem Sou Eu? numa sala.
 *
 * O teste que sustenta o jogo em rede é o primeiro daqui: **a minha identidade não pode trafegar
 * para o meu celular.** É a inversão que define este jogo — em todos os outros, o segredo é meu e
 * o filtro serve para os outros não verem; aqui todo mundo vê e só eu não posso.
 *
 * E um vazamento aqui não dá vantagem a ninguém: mata a rodada daquele jogador em silêncio. Ele
 * abre o app, vê a resposta e não tem mais o que descobrir.
 */

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
    for (let guarda = 0; guarda < 400; guarda++) {
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

const NOMES = ['ana', 'bia', 'caio', 'duda'];

/** Todos os ids do banco local, para marcar "já visto" e tornar o sorteio determinístico. */
const IDENTITIES_IDS = IDENTITIES.map((i) => i.id);

function sala(quantos = 4, settings: Partial<WhoamiSettings> = {}, totalRounds = 2, seed = 7) {
  const nomes = NOMES.slice(0, quantos);
  const clock = fakeClock();
  const [host, ...guests] = nomes;
  const input: CreateRoomInput = { gameId: 'whoami', category: 'Aleatório', totalRounds, maxPlayers: 12, settings };
  const engine = RoomEngine.create('4827', input, { id: host, name: host, color: '#7C3AED' }, { scheduler: clock.scheduler, rng: seeded(seed) });
  for (const g of guests) engine.join({ id: g, name: g, color: '#FACC15' });
  const view = (id: PlayerId) => engine.snapshotFor(id).game as WhoamiView;
  return { engine, clock, view, host, guests, all: nomes };
}

/** Sala com a primeira rodada já correndo. */
function rodando(quantos = 4, settings: Partial<WhoamiSettings> = {}, totalRounds = 2, seed = 7) {
  const r = sala(quantos, settings, totalRounds, seed);
  r.engine.dispatch(r.host, { type: 'startMatch' });
  return r;
}

/**
 * O nome que um jogador tem de descobrir, lido do estado do SERVIDOR.
 *
 * Os testes espiam por aqui de propósito: é o único lugar onde esse dado existe, e provar isso é
 * metade do que este arquivo faz.
 */
const identidadeNoServidor = (engine: RoomEngine, id: PlayerId): string =>
  (engine.serialize().game as { whoami: { assigned: Record<string, { name: string }> } }).whoami.assigned[id].name;

const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof RoomError, `esperava RoomError, veio ${e}`);
    return e.code;
  }
  assert.fail('deveria ter lançado');
};

/* ------------------------------------------------------- o segredo ------ */

test('a minha identidade nunca sai do servidor para o meu celular', () => {
  const r = rodando(4);
  for (const id of r.all) {
    const minha = identidadeNoServidor(r.engine, id);
    const fio = JSON.stringify(r.engine.snapshotFor(id));
    assert.ok(!fio.includes(minha), `o snapshot de ${id} carrega a própria identidade ("${minha}")`);
  }
});

test('a identidade dos outros vai inteira: é disso que o jogo vive', () => {
  const r = rodando(4);
  const v = r.view(r.host);
  assert.equal(v.visibleIdentities.length, 3, 'o host não viu as identidades dos outros três');
  for (const outro of v.visibleIdentities) {
    assert.equal(outro.name, identidadeNoServidor(r.engine, outro.playerId));
    assert.ok(outro.emoji.length > 0);
  }
  // E a própria vem marcada como segredo, sem nome.
  assert.equal(v.mine?.secret, true);
  assert.equal(v.mine?.name, null);
});

test('a dica que o jogador não pagou não trafega', () => {
  const r = rodando(4);
  const daVez = r.view(r.host).turnId!;
  const dicas = (
    r.engine.serialize().game as { whoami: { assigned: Record<string, { hints: string[] }> } }
  ).whoami.assigned[daVez].hints;

  // Nenhuma pedida: nenhuma no fio.
  assert.deepEqual(r.view(daVez).mine?.hints, []);
  const fioAntes = JSON.stringify(r.engine.snapshotFor(daVez));
  for (const d of dicas) assert.ok(!fioAntes.includes(d), 'uma dica não pedida vazou');

  // Pede duas: só essas duas aparecem.
  r.engine.dispatch(daVez, { type: 'takeHint' });
  r.engine.dispatch(daVez, { type: 'takeHint' });
  const v = r.view(daVez);
  assert.equal(v.mine?.hints.length, 2);
  assert.equal(v.mine?.hints[1], dicas[0], 'a segunda dica deveria ser a primeira escrita');
  assert.ok(!JSON.stringify(r.engine.snapshotFor(daVez)).includes(dicas[1]), 'a terceira dica vazou');
});

test('as dicas de um jogador não aparecem no celular dos outros', () => {
  const r = rodando(4);
  const daVez = r.view(r.host).turnId!;
  r.engine.dispatch(daVez, { type: 'takeHint' });
  const minhaDica = r.view(daVez).mine!.hints[0];

  for (const outro of r.all.filter((id) => id !== daVez)) {
    assert.ok(!JSON.stringify(r.engine.snapshotFor(outro)).includes(minhaDica), `a dica de ${daVez} apareceu para ${outro}`);
  }
});

test('depois de acertar, a própria identidade pode aparecer — já não é segredo', () => {
  const r = rodando(4);
  const daVez = r.view(r.host).turnId!;
  const minha = identidadeNoServidor(r.engine, daVez);
  r.engine.dispatch(daVez, { type: 'guessIdentity', guess: minha });

  const v = r.view(daVez);
  assert.equal(v.mine?.found, true);
  assert.equal(v.mine?.name, minha, 'quem acertou tem direito de ver o que era');
  assert.equal(v.mine?.secret, false);
});

/* --------------------------------------------------------- o turno ------ */

test('só quem está na vez chuta, pede dica ou passa', () => {
  const r = rodando(4);
  const daVez = r.view(r.host).turnId!;
  const outro = r.all.find((id) => id !== daVez)!;

  assert.equal(code(() => r.engine.dispatch(outro, { type: 'guessIdentity', guess: 'qualquer coisa' })), 'bad_request');
  assert.equal(code(() => r.engine.dispatch(outro, { type: 'takeHint' })), 'bad_request');
  assert.equal(code(() => r.engine.dispatch(outro, { type: 'passTurn' })), 'bad_request');
});

test('passar a vez muda de quem é a vez, e não penaliza', () => {
  const r = rodando(4);
  const antes = r.view(r.host).turnId!;
  r.engine.dispatch(antes, { type: 'passTurn' });
  const depois = r.view(r.host).turnId!;
  assert.notEqual(depois, antes);
  assert.equal(r.view(antes).mine?.misses, 0);
});

test('o prazo do turno passa a vez sozinho', () => {
  const r = rodando(4, { turnSeconds: 15 });
  const antes = r.view(r.host).turnId!;
  assert.equal(r.view(r.host).turnEndsAt, r.clock.at() + 15_000);
  r.clock.advance(16_000);
  assert.notEqual(r.view(r.host).turnId, antes, 'a vez não passou quando o tempo acabou');
});

test('sem limite de tempo, não há prazo nenhum para a sala armar', () => {
  const r = rodando(4, { turnSeconds: 0, roundMinutes: 0 });
  assert.equal(r.view(r.host).turnEndsAt, null);
  assert.equal(r.view(r.host).roundEndsAt, null);
});

test('a vez de quem caiu não trava a rodada', () => {
  // Sem isto, uma partida sem limite de tempo travaria para sempre no jogador que fechou o app —
  // não há prazo para vencer e passar a vez sozinho.
  const r = rodando(4, { turnSeconds: 0 });
  const daVez = r.view(r.host).turnId!;
  // Lê a foto por outra pessoa: se quem caiu é o host, o snapshot dele não serve de referência.
  const observador = r.all.find((id) => id !== daVez)!;
  r.engine.setConnected(daVez, false);
  assert.notEqual(r.view(observador).turnId, daVez, 'a vez ficou com quem desconectou');
  assert.ok(r.view(observador).turnId, 'a rodada ficou sem ninguém na vez');
});

/* ------------------------------------------------------- a rodada ------ */

test('quando o último descobre, a sala vai para a revelação', () => {
  const r = rodando(3, {}, 2);
  for (const id of [...r.all]) {
    const daVez = r.view(r.host).turnId;
    if (!daVez) break;
    r.engine.dispatch(daVez, { type: 'guessIdentity', guess: identidadeNoServidor(r.engine, daVez) });
  }
  assert.equal(r.engine.phase, 'revealing');
  const v = r.view(r.host);
  assert.equal(v.reveal?.length, 3);
  assert.ok(v.reveal!.every((linha) => linha.found));
});

test('na revelação todo mundo vê a identidade de todo mundo, inclusive a própria', () => {
  const r = rodando(3, {}, 2);
  r.engine.dispatch(r.host, { type: 'endRound' });
  for (const id of r.all.slice(0, 3)) {
    const v = r.view(id);
    assert.equal(v.reveal?.length, 3, `${id} não recebeu a revelação`);
    assert.equal(v.mine?.name, identidadeNoServidor(r.engine, id), `${id} não viu a própria identidade na revelação`);
  }
});

test('o prazo da rodada encerra a rodada, e vem antes do prazo do turno', () => {
  const r = rodando(4, { turnSeconds: 15, roundMinutes: 5 });
  r.clock.advance(5 * 60_000 + 1000);
  assert.equal(r.engine.phase, 'revealing');
  assert.ok(r.view(r.host).reveal);
});

test('quem não descobriu aparece na revelação como não descoberto', () => {
  const r = rodando(3, {}, 2);
  const daVez = r.view(r.host).turnId!;
  r.engine.dispatch(daVez, { type: 'guessIdentity', guess: identidadeNoServidor(r.engine, daVez) });
  r.engine.dispatch(r.host, { type: 'endRound' });

  const reveal = r.view(r.host).reveal!;
  assert.equal(reveal.filter((l) => l.found).length, 1);
  assert.equal(reveal.filter((l) => !l.found).length, 2);
});

test('a rodada seguinte distribui identidades novas', () => {
  const r = rodando(3, {}, 2);
  const primeiras = r.all.slice(0, 3).map((id) => identidadeNoServidor(r.engine, id));
  r.engine.dispatch(r.host, { type: 'endRound' });
  r.engine.dispatch(r.host, { type: 'nextRound' });

  assert.equal(r.engine.phase, 'guessing');
  assert.equal(r.view(r.host).roundIndex, 2);
  const segundas = r.all.slice(0, 3).map((id) => identidadeNoServidor(r.engine, id));
  assert.deepEqual(
    segundas.filter((n) => primeiras.includes(n)),
    [],
    'a segunda rodada repetiu identidade da primeira',
  );
});

test('a partida acaba na última rodada', () => {
  const r = rodando(3, {}, 2);
  r.engine.dispatch(r.host, { type: 'endRound' });
  r.engine.dispatch(r.host, { type: 'nextRound' });
  r.engine.dispatch(r.host, { type: 'endRound' });
  r.engine.dispatch(r.host, { type: 'nextRound' });

  assert.equal(r.engine.phase, 'finished');
  const v = r.view(r.host);
  assert.equal(v.summary?.rounds, 2);
  assert.equal(v.summary?.standings.length, 3);
});

/* ------------------------------------------------------- pontuação ------ */

test('o placar da sala acompanha os pontos do jogo', () => {
  const r = rodando(3, {}, 2);
  const daVez = r.view(r.host).turnId!;
  r.engine.dispatch(daVez, { type: 'guessIdentity', guess: identidadeNoServidor(r.engine, daVez) });
  r.engine.dispatch(r.host, { type: 'endRound' });

  const snap = r.engine.snapshotFor(r.host);
  const meu = snap.scores.find((s) => s.playerId === daVez)!;
  assert.equal(meu.points, WHOAMI_POINTS.found[0] + WHOAMI_POINTS.firstBonus);
});

test('com dicas desligadas, pedir dica é recusado', () => {
  const r = rodando(4, { hints: false });
  const daVez = r.view(r.host).turnId!;
  assert.equal(code(() => r.engine.dispatch(daVez, { type: 'takeHint' })), 'bad_request');
  assert.equal(r.view(daVez).mine?.hintsLeft, 0);
});

test('as dicas acabam, e a quarta é recusada', () => {
  const r = rodando(4);
  const daVez = r.view(r.host).turnId!;
  for (let i = 0; i < WHOAMI_HINTS; i++) r.engine.dispatch(daVez, { type: 'takeHint' });
  assert.equal(r.view(daVez).mine?.hintsLeft, 0);
  assert.equal(code(() => r.engine.dispatch(daVez, { type: 'takeHint' })), 'bad_request');
});

/* ------------------------------------------------------- a sala ------ */

test('só o host conduz a rodada', () => {
  const r = rodando(4);
  assert.equal(code(() => r.engine.dispatch(r.guests[0], { type: 'endRound' })), 'not_host');
  assert.equal(code(() => r.engine.dispatch(r.guests[0], { type: 'endMatch' })), 'not_host');
});

test('a bomba pausa, este jogo não', () => {
  // Pausar pararia os dois prazos no meio da vez de alguém. Quem precisa parar encerra a rodada.
  const r = rodando(4);
  assert.equal(code(() => r.engine.dispatch(r.host, { type: 'setPaused', paused: true })), 'bad_request');
});

test('quem sai no meio sai da ordem, e a identidade dele sai com ele', () => {
  const r = rodando(4, { turnSeconds: 0 });
  const vitima = r.guests[1];
  r.engine.dispatch(r.host, { type: 'endRound' });
  r.engine.dispatch(r.host, { type: 'nextRound' });

  r.engine.leave(vitima);
  const v = r.view(r.host);
  assert.ok(!v.visibleIdentities.some((o) => o.playerId === vitima), 'a identidade de quem saiu continuou na tela');
  assert.notEqual(v.turnId, vitima);
});

test('"jogar de novo" mantém a turma e não reencontra as identidades da partida anterior', () => {
  const r = rodando(3, {}, 1);
  const primeiras = r.all.slice(0, 3).map((id) => identidadeNoServidor(r.engine, id));
  r.engine.dispatch(r.host, { type: 'endRound' });
  r.engine.dispatch(r.host, { type: 'nextRound' });
  assert.equal(r.engine.phase, 'finished');

  r.engine.dispatch(r.host, { type: 'playAgain' });
  assert.equal(r.engine.phase, 'lobby');
  // A sala lembra o que gastou: numa sala não há aparelho comum para guardar isso.
  const guardado = (r.engine.serialize().game as { seenIds?: string[] }).seenIds ?? [];
  assert.ok(guardado.length >= 3, `a sala esqueceu o que gastou (${guardado.length} ids)`);

  r.engine.dispatch(r.host, { type: 'startMatch' });
  const segundas = r.all.slice(0, 3).map((id) => identidadeNoServidor(r.engine, id));
  assert.deepEqual(
    segundas.filter((n) => primeiras.includes(n)),
    [],
    'a partida nova repetiu identidade da anterior',
  );
});

test('a sala sobrevive a um reinício do servidor com a rodada em curso', () => {
  const r = rodando(4);
  const antes = r.all.map((id) => identidadeNoServidor(r.engine, id));
  const salvo = r.engine.serialize();

  const voltou = RoomEngine.restore(salvo, { scheduler: r.clock.scheduler, rng: seeded(7) });
  assert.equal(voltou.phase, 'guessing');
  assert.deepEqual(
    r.all.map((id) => identidadeNoServidor(voltou, id)),
    antes,
    'as identidades mudaram ao restaurar',
  );
  // E o segredo continua de pé depois do reinício.
  for (const id of r.all) {
    assert.ok(!JSON.stringify(voltou.snapshotFor(id)).includes(identidadeNoServidor(voltou, id)), `depois do reinício, ${id} passou a ver a própria identidade`);
  }
});

test('sala restaurada de uma versão sem o campo de memória não quebra', () => {
  const r = rodando(3, {}, 1);
  const salvo = r.engine.serialize();
  delete (salvo.game as { seenIds?: string[] }).seenIds;

  const voltou = RoomEngine.restore(salvo, { scheduler: r.clock.scheduler, rng: seeded(9) });
  assert.equal(voltou.phase, 'guessing');
  assert.ok(voltou.snapshotFor(r.host));
});

test('chute vazio ou absurdamente longo é recusado antes de contar como erro', () => {
  const r = rodando(4);
  const daVez = r.view(r.host).turnId!;
  assert.equal(code(() => r.engine.dispatch(daVez, { type: 'guessIdentity', guess: '   ' })), 'bad_request');
  assert.equal(code(() => r.engine.dispatch(daVez, { type: 'guessIdentity', guess: 'x'.repeat(200) })), 'bad_request');
  assert.equal(r.view(daVez).mine?.misses, 0, 'um chute recusado contou como erro');
  assert.equal(r.view(r.host).turnId, daVez, 'um chute recusado passou a vez');
});

/* --------------------------------------- conteúdo gerado por IA ------ */

/**
 * As identidades geradas entrando na sala.
 *
 * O caminho é `receiveContent`, e ele **não é um comando de protocolo** de propósito: quem entrega
 * é o processo do servidor, que tem o objeto do motor na mão. Se fosse comando, qualquer cliente
 * poderia empurrar conteúdo para dentro da sala.
 */

const geradaCrua = (nome: string) => ({
  name: nome,
  emoji: '🦔',
  category: 'Animais',
  difficulty: 'facil',
  kind: 'animal',
  aliases: [],
  hints: [`Me enrolo numa bola quando sinto perigo, e me chamam de ${nome.length} coisas.`, 'Fui mascote de uma Copa do Mundo uma vez.'],
});

test('identidade gerada entra na sala e pode sair no sorteio', () => {
  const r = sala(3, { categories: ['Animais'], difficulties: ['facil'] }, 1, 23);
  assert.equal(r.engine.provideContent([geradaCrua('Tatu-bola'), geradaCrua('Quati')]), true);

  // Com o banco inteiro marcado como já visto, só sobra o que foi gerado — e aí o sorteio deixa
  // de ser sorte: as geradas são as únicas inéditas.
  const salvo = r.engine.serialize();
  (salvo.game as { seenIds: string[] }).seenIds = IDENTITIES_IDS;
  const voltou = RoomEngine.restore(salvo, { scheduler: r.clock.scheduler, rng: seeded(23) });
  voltou.dispatch(r.host, { type: 'startMatch' });

  const nomes = r.all.slice(0, 3).map((id) => identidadeNoServidor(voltou, id));
  assert.ok(
    nomes.some((n) => n === 'Tatu-bola' || n === 'Quati'),
    `nenhuma identidade gerada entrou no sorteio: ${nomes.join(' · ')}`,
  );
});

test('conteúdo gerado passa pela portaria do motor, mesmo vindo do servidor', () => {
  // A regra de conteúdo é uma só, e quem decide o que a mesa vê é quem monta a rodada. Uma dica
  // que entrega o nome é recusada aqui também, não só no servidor.
  const r = sala(3, {}, 1, 29);
  assert.equal(r.engine.provideContent([{ ...geradaCrua('Jabuti'), hints: ['Sou o Jabuti, aquele mesmo.', 'Ando devagar e tenho casco duro nas costas.'] }]), false);
  assert.equal(r.engine.provideContent('nem é lista'), false);
  assert.equal(r.engine.provideContent([]), false);
});

test('conteúdo só entra no lobby: com a partida andando, o baralho não muda', () => {
  // Trocar o baralho no meio mudaria o sorteio debaixo de uma rodada já distribuída.
  const r = rodando(3, {}, 1);
  assert.equal(r.engine.provideContent([geradaCrua('Paca')]), false);
});

test('o pool não vaza no snapshot dos jogadores', () => {
  // Ele traz nome, aliases e as duas dicas de 24 identidades. No fio, seria entregar o jogo.
  const r = sala(3, {}, 1, 31);
  r.engine.provideContent([geradaCrua('Tatu-bola')]);
  r.engine.dispatch(r.host, { type: 'startMatch' });
  for (const id of r.all.slice(0, 3)) {
    const fio = JSON.stringify(r.engine.snapshotFor(id));
    assert.ok(!fio.includes('"pool"'), `o snapshot de ${id} carrega o pool`);
    assert.ok(!fio.includes('Fui mascote de uma Copa'), `uma dica do pool vazou para ${id}`);
  }
});

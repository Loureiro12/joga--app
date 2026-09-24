import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_ENGINE_CONFIG,
  RoomEngine,
  RoomError,
  type BombSettings,
  type GameView,
  type PlayerId,
  type Scheduler,
} from '../src/index';

type BombView = Extract<GameView, { kind: 'bomb' }>;

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

const NOMES = ['ana', 'bia', 'caio', 'duda'];

function sala(quantos = 4, settings: Partial<BombSettings> = {}, seed = 7) {
  const nomes = NOMES.slice(0, quantos);
  const clock = fakeClock();
  const [host, ...guests] = nomes;
  const engine = RoomEngine.create(
    '4827',
    // Quantas rodadas é campo da sala, como nos outros jogos — não das opções da bomba.
    { gameId: 'bomb', category: 'Aleatório', totalRounds: settings.totalRounds ?? 0, maxPlayers: 12, settings },
    { id: host, name: host, color: '#7C3AED' },
    { scheduler: clock.scheduler, rng: seeded(seed) },
  );
  for (const g of guests) engine.join({ id: g, name: g, color: '#FACC15' });
  const view = (id: PlayerId) => engine.snapshotFor(id).game as BombView;
  return { engine, clock, view, host, guests, all: nomes };
}

/** Sala já com a bomba acesa na mão de quem começou. */
function acesa(quantos = 4, settings: Partial<BombSettings> = {}, seed = 7) {
  const r = sala(quantos, settings, seed);
  r.engine.dispatch(r.host, { type: 'startMatch' });
  r.engine.dispatch(r.view(r.host).activeId, { type: 'armBomb' });
  return r;
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

/* ------------------------------------------------------------ o pavio ------ */

/**
 * O teste que sustenta o jogo em rede. Com um celular só, o instante da explosão ficava na
 * memória daquele aparelho e ninguém olhava. Em sala ele trafega — e quem abrisse o WebSocket
 * saberia o segundo exato, que é a única coisa que a Bomba-Relógio depende de esconder.
 */
test('o instante da explosão nunca sai do servidor', () => {
  const r = acesa(4);
  // O valor de verdade, lido do estado salvo do servidor — é ele que não pode aparecer no fio.
  const salvo = (r.engine.serialize().game as { bomb: { explodeAt: number; pendingAlarms: number[] } }).bomb;
  assert.ok(salvo.explodeAt > 0, 'o pavio nem foi sorteado: o teste não provaria nada');

  for (const id of r.all) {
    const fio = JSON.stringify(r.engine.snapshotFor(id));
    for (const campo of ['explodeAt', 'heldSince', 'pendingAlarms', 'usedChallengeIds', 'heldMs']) {
      assert.ok(!fio.includes(`"${campo}"`), `o snapshot de ${id} carrega "${campo}"`);
    }
    // Nem o número cru, por nenhum outro nome.
    assert.ok(!fio.includes(String(salvo.explodeAt)), `o instante da explosão vazou no snapshot de ${id}`);
    for (const alarme of salvo.pendingAlarms) assert.ok(!fio.includes(String(alarme)), `o instante do susto vazou para ${id}`);
  }
});

test('no Alfabeto, o tempo de cada letra também fica de fora', () => {
  const r = acesa(4, { variant: 'alfabeto' });
  const letra = r.view(r.host).alphabet!.letters[0];
  r.engine.dispatch(r.view(r.host).activeId, { type: 'useLetter', letter: letra });

  const usadas = r.view('bia').alphabet!.used;
  assert.equal(usadas.length, 1);
  // Somados, os tempos diriam há quanto tempo o pavio queima.
  assert.deepEqual(Object.keys(usadas[0]).sort(), ['letter', 'playerId']);
  assert.ok(!JSON.stringify(r.engine.snapshotFor('bia')).includes('"ms"'));
});

/* ------------------------------------------------------ de quem é a vez ---- */

test('só quem está com a bomba acende, passa ou toca a letra', () => {
  const r = sala(4);
  r.engine.dispatch(r.host, { type: 'startMatch' });
  assert.equal(r.engine.phase, 'handoff');

  const comABomba = r.view(r.host).activeId;
  const outro = r.all.find((id) => id !== comABomba)!;

  // Acender a bomba na mão do outro seria decidir quando o pavio dele começa.
  assert.equal(code(() => r.engine.dispatch(outro, { type: 'armBomb' })), 'bad_request');
  r.engine.dispatch(comABomba, { type: 'armBomb' });
  assert.equal(r.engine.phase, 'armed');

  assert.equal(code(() => r.engine.dispatch(outro, { type: 'passBomb' })), 'bad_request');
  r.engine.dispatch(comABomba, { type: 'passBomb' });
  assert.notEqual(r.view(r.host).activeId, comABomba, 'a bomba não mudou de mão');
});

test('a vez segue a ordem da sala, e todo mundo vê a mesma coisa', () => {
  const r = acesa(4, { order: 'circular' });
  const vistas: string[] = [];
  for (let i = 0; i < 4; i++) {
    const atual = r.view(r.host).activeId;
    vistas.push(atual);
    // Os quatro celulares concordam sobre de quem é a vez: é o que faz o jogo funcionar.
    for (const id of r.all) assert.equal(r.view(id).activeId, atual, `${id} viu outra pessoa com a bomba`);
    r.engine.dispatch(atual, { type: 'passBomb' });
  }
  assert.equal(new Set(vistas).size, 4, 'a bomba não deu a volta na mesa');
});

/* ------------------------------------------------------------- a explosão -- */

test('o servidor faz a bomba estourar sozinho, sem ninguém tocar em nada', () => {
  const r = acesa(4, { minSeconds: 20, maxSeconds: 20 });
  const quem = r.view(r.host).activeId;
  assert.equal(r.engine.phase, 'armed');

  // Ninguém manda comando nenhum: é o alarme da sala que dispara.
  r.clock.advance(21_000);

  assert.equal(r.engine.phase, 'revealing');
  for (const id of r.all) {
    const v = r.view(id);
    assert.equal(v.phase, 'exploded');
    assert.equal(v.loserId, quem, `${id} viu outro perdedor`);
  }
  assert.equal(r.view(r.host).bombs[quem], 1);
});

test('o susto chega a todos os celulares e não mexe no pavio', () => {
  // Procura uma semente que sorteie susto — ele não sai em toda rodada (§38).
  let r: ReturnType<typeof acesa> | null = null;
  for (let seed = 1; seed < 60; seed++) {
    const tentativa = acesa(4, { minSeconds: 60, maxSeconds: 60 }, seed);
    const salvo = (tentativa.engine.serialize().game as { bomb: { pendingAlarms: number[] } }).bomb;
    if (salvo.pendingAlarms.length) {
      r = tentativa;
      break;
    }
  }
  assert.ok(r, 'nenhuma semente sorteou susto — o teste não teria o que provar');

  const quem = r.view(r.host).activeId;
  r.clock.advance(40_000);

  const alarmes = r.view(r.host).alarmCount;
  assert.ok(alarmes > 0, 'o susto não disparou');
  for (const id of r.all) assert.equal(r.view(id).alarmCount, alarmes, `${id} não ouviu o susto`);
  // O susto é teatro: não apaga a bomba nem muda de mão.
  assert.equal(r.engine.phase, 'armed', 'o susto apagou a bomba');
  assert.equal(r.view(r.host).activeId, quem, 'o susto passou a bomba adiante');
});

test('a bomba não pausa', () => {
  const r = acesa(4);
  // Parar o relógio daria a quem está com ela o poder de fugir da explosão.
  assert.equal(code(() => r.engine.dispatch(r.host, { type: 'setPaused', paused: true })), 'bad_request');
});

/* --------------------------------------------------------------- Alfabeto -- */

test('Alfabeto: tocar a letra passa a bomba, e gastar todas desarma', () => {
  const r = acesa(3, { variant: 'alfabeto', minSeconds: 300, maxSeconds: 300 });
  const round = r.view(r.host).alphabet!;
  assert.ok(round.letters.length >= 10, 'tema sem letras suficientes');

  for (const letra of round.letters) {
    if (r.engine.phase !== 'armed') break;
    r.engine.dispatch(r.view(r.host).activeId, { type: 'useLetter', letter: letra });
  }

  // Gastaram o alfabeto antes de estourar: ninguém perdeu (§29).
  assert.equal(r.view(r.host).phase, 'disarmed');
  assert.equal(r.view(r.host).loserId, null);
  assert.equal(r.engine.phase, 'revealing');
});

test('letra inválida não pune ninguém: o estado fica como estava', () => {
  const r = acesa(3, { variant: 'alfabeto' });
  const antes = r.view(r.host);
  const usada = antes.alphabet!.letters[0];
  r.engine.dispatch(antes.activeId, { type: 'useLetter', letter: usada });
  const depois = r.view(r.host);

  // Repetir a mesma letra é toque inválido: a bomba não muda de mão nem estoura.
  r.engine.dispatch(depois.activeId, { type: 'useLetter', letter: usada });
  assert.equal(r.view(r.host).activeId, depois.activeId, 'um toque inválido passou a bomba');
  assert.equal(r.view(r.host).alphabet!.used.length, 1);
});

/* ------------------------------------------------------- sala e imprevistos */

test('quem sai com a bomba na mão não explode de longe', () => {
  const r = acesa(4);
  const quem = r.view(r.host).activeId;
  const outro = r.all.find((id) => id !== quem && id !== r.host)!;

  r.engine.leave(quem);
  const depois = r.view(r.host);
  assert.notEqual(depois.activeId, quem, 'a bomba ficou com quem saiu da sala');
  assert.ok(r.all.includes(depois.activeId));
  void outro;

  // E a partida segue: quem recebeu consegue passar.
  r.engine.dispatch(depois.activeId, { type: 'passBomb' });
  assert.equal(r.engine.phase, 'armed');
});

test('rodada seguinte e fim de partida', () => {
  const r = acesa(3, { minSeconds: 20, maxSeconds: 20, totalRounds: 2 });
  r.clock.advance(21_000);
  assert.equal(r.view(r.host).phase, 'exploded');

  r.engine.dispatch(r.host, { type: 'nextRound' });
  assert.equal(r.engine.phase, 'handoff');
  assert.equal(r.view(r.host).roundIndex, 2);

  r.engine.dispatch(r.view(r.host).activeId, { type: 'armBomb' });
  r.clock.advance(21_000);
  r.engine.dispatch(r.host, { type: 'nextRound' });

  assert.equal(r.engine.phase, 'finished');
  const fim = r.view(r.host);
  assert.equal(fim.standings?.length, 3);
  assert.ok(fim.highlights !== null, 'o fim não trouxe os destaques');
});

test('só o host passa de rodada', () => {
  const r = acesa(3, { minSeconds: 20, maxSeconds: 20 });
  r.clock.advance(21_000);
  assert.equal(code(() => r.engine.dispatch('bia', { type: 'nextRound' })), 'not_host');
});

test('quantas rodadas é a sala que decide, não as opções da bomba', () => {
  // A bomba tem um `totalRounds` próprio, herdado da versão de um celular. Se ele valesse aqui,
  // a tela diria "rodada 2 de 2" e a partida seguiria até a décima.
  const clock = fakeClock();
  const engine = RoomEngine.create(
    '4827',
    { gameId: 'bomb', category: 'Aleatório', totalRounds: 3, maxPlayers: 12, settings: { totalRounds: 99 } },
    { id: 'ana', name: 'ana', color: '#7C3AED' },
    { scheduler: clock.scheduler, rng: seeded(7) },
  );
  engine.join({ id: 'bia', name: 'bia', color: '#FACC15' });
  engine.dispatch('ana', { type: 'startMatch' });
  assert.equal((engine.snapshotFor('ana').game as BombView).totalRounds, 3);
});

test('as opções do host são entrada de rede: vêm saneadas ou não vêm', () => {
  const r = sala(3, { variant: 'alfabeto', minSeconds: 1, maxSeconds: 9999, lives: 99, difficulties: ['media' as never] });
  r.engine.dispatch(r.host, { type: 'startMatch' });
  const salvo = r.engine.serialize().game as { settings: BombSettings };
  assert.ok(salvo.settings.minSeconds >= 5 && salvo.settings.maxSeconds <= 300, 'faixa de tempo fora do limite');
  assert.ok(salvo.settings.lives <= 5);
  // 'media' é do Desafio Secreto; a bomba usa 'medio'. O sanitizador descarta e cai no padrão.
  assert.deepEqual(salvo.settings.difficulties, ['facil', 'medio']);
});

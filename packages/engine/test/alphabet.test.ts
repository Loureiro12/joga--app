import assert from 'node:assert/strict';
import { test } from 'node:test';

import { THEMES } from '../src/games/alphabet-themes';
import {
  ALPHABET_CATEGORIES,
  ALPHABET_RULES,
  DEFAULT_ALPHABET_SETTINGS,
  FULL_ALPHABET,
  armBomb,
  baseLetter,
  bombTick,
  canUseLetter,
  countThemes,
  createBombMatch,
  drawFuse,
  highlights,
  isPlayableTheme,
  nextRound,
  remainingLetters,
  sanitizeBombSettings,
  useLetter,
  type BombPlayer,
  type BombSettings,
  type BombState,
} from '../src/index';

const players: BombPlayer[] = ['ana', 'bia', 'caio'].map((id) => ({ id, name: id.toUpperCase(), color: '#EF4444' }));
const T0 = 1_000_000;
const seeded = (seed: number) => {
  let x = seed;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
};
const fixo = (v: number) => () => v;

function partida(over: Partial<BombSettings> = {}, rng = seeded(7)) {
  return createBombMatch(players, { ...DEFAULT_ALPHABET_SETTINGS, ...over }, T0, rng);
}
/** Acende a bomba com um pavio longo, para o teste controlar quando ela estoura. */
const acesa = (state: BombState) => armBomb(state, T0, fixo(0.99));

/* -------------------------------------------------------------------- temas */

test('banco de temas: categorias certas, sem id repetido e sem letra impossível', () => {
  assert.equal(THEMES.length, 18);
  assert.deepEqual([...new Set(THEMES.map((t) => t.category))].sort(), [...ALPHABET_CATEGORIES].sort());

  const ids = THEMES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'id repetido');

  for (const tema of THEMES) {
    // Um tema curto demais trava o grupo no meio da rodada, que é o oposto da graça (§20).
    assert.ok(isPlayableTheme(tema), `${tema.name} tem só ${tema.letters.length} letras`);
    assert.match(tema.letters, /^[A-Z]+$/, `${tema.name}: letras fora do A–Z`);
    assert.equal(new Set(tema.letters).size, tema.letters.length, `${tema.name}: letra repetida`);
    assert.deepEqual([...tema.letters], [...tema.letters].sort(), `${tema.name}: letras fora de ordem`);
    assert.ok(tema.name.length <= 24 && tema.emoji.length > 0);
  }

  // Letras que quase nunca têm resposta não podem virar praxe.
  for (const dificil of ['K', 'W', 'X', 'Y']) {
    const quantos = THEMES.filter((t) => t.letters.includes(dificil)).length;
    assert.ok(quantos <= 6, `"${dificil}" aparece em ${quantos} temas — está sendo usada de enfeite`);
  }
});

/* ------------------------------------------------------------------ rodada */

test('tocar a letra passa a bomba, e a letra não volta', () => {
  const state = acesa(partida());
  assert.equal(state.alphabet!.used.length, 0);
  const primeiro = state.activeId;
  const letra = remainingLetters(state)[0];

  const depois = useLetter(state, letra, T0 + 2_000);
  assert.deepEqual(
    depois.alphabet!.used.map((u) => [u.letter, u.playerId, u.ms]),
    [[letra, primeiro, 2_000]],
  );
  assert.notEqual(depois.activeId, primeiro, 'tocar a letra é o que passa a bomba (§6)');
  assert.equal(depois.explodeAt, state.explodeAt, 'o pavio não reinicia');
  assert.ok(!remainingLetters(depois).includes(letra));
  assert.equal(canUseLetter(depois, letra), false, 'a letra não pode ser tocada de novo');
  // Minúscula é o mesmo toque: a tela manda o que quiser.
  assert.equal(canUseLetter(depois, letra.toLowerCase()), false);
});

test('toque inválido não faz nada — e não pune ninguém', () => {
  const state = acesa(partida());
  const deFora = [...FULL_ALPHABET].find((l) => !state.alphabet!.letters.includes(l));
  if (deFora) assert.equal(useLetter(state, deFora, T0 + 500), state, 'letra fora do tema foi aceita');

  const usada = remainingLetters(state)[0];
  const comUma = useLetter(state, usada, T0 + 500);
  assert.equal(useLetter(comUma, usada, T0 + 900), comUma, 'letra repetida foi aceita');

  // Com a bomba apagada, a grade inteira está fria.
  const noHandoff = partida();
  assert.equal(useLetter(noHandoff, remainingLetters(noHandoff)[0] ?? 'A', T0), noHandoff);
});

test('quem estiver com a bomba quando ela estoura perde, mesmo a meio toque', () => {
  const state = acesa(partida());
  const comUma = useLetter(state, remainingLetters(state)[0], T0 + 1_000);
  const vitima = comUma.activeId;

  const boom = bombTick(comUma, comUma.explodeAt!);
  assert.equal(boom.phase, 'exploded');
  assert.equal(boom.loserId, vitima);
  assert.equal(boom.bombs[vitima], 1);
  // Depois do estouro a grade congela (§27).
  assert.equal(canUseLetter(boom, remainingLetters(boom)[0] ?? 'A'), false);
  assert.equal(useLetter(boom, remainingLetters(boom)[0] ?? 'A', boom.explodeAt ?? T0), boom);
});

/* ---------------------------------------------------------------- desarmar */

test('gastar a última letra desarma a bomba: ninguém perde', () => {
  let state = acesa(partida());
  const total = state.alphabet!.letters.length;

  for (let i = 0; i < total; i++) {
    const restantes = remainingLetters(state);
    assert.equal(restantes.length, total - i);
    state = useLetter(state, restantes[0], T0 + (i + 1) * 500);
  }

  assert.equal(state.phase, 'disarmed');
  assert.equal(state.loserId, null, 'rodada desarmada não tem perdedor');
  assert.deepEqual(state.bombs, { ana: 0, bia: 0, caio: 0 }, 'ninguém leva bomba');
  assert.equal(state.explodeAt, null, 'a bomba para na hora');
  assert.deepEqual(remainingLetters(state), []);
  // A sequência de todo mundo continua: ninguém explodiu.
  assert.ok(Object.values(state.bestStreak).every((s) => s === 1));
  assert.equal(state.history.at(-1)?.disarmed, true);

  // E a rodada seguinte começa normalmente, com o alfabeto inteiro de volta (§38).
  const proxima = nextRound(state, seeded(3));
  assert.equal(proxima.phase, 'handoff');
  assert.equal(proxima.alphabet!.used.length, 0);
  assert.ok(remainingLetters(proxima).length >= ALPHABET_RULES.minLetters);
});

test('no modo pontos, letra vale e desarmar vale mais', () => {
  const { letter, disarm } = ALPHABET_RULES.points;
  let state = acesa(partida({ mode: 'pontos' }));
  const primeiro = state.activeId;
  state = useLetter(state, remainingLetters(state)[0], T0 + 800);
  assert.equal(state.points[primeiro], letter);

  // Gasta o resto: todo mundo que sobreviveu leva o bônus do desarme.
  while (state.phase === 'armed') state = useLetter(state, remainingLetters(state)[0], T0 + 900);
  assert.equal(state.phase, 'disarmed');
  for (const p of players) assert.ok((state.points[p.id] ?? 0) >= disarm, `${p.id} não recebeu o bônus do desarme`);
});

/* ------------------------------------------------------------ configuração */

test('hardcore abre o A–Z inteiro; o normal fica nas letras do tema', () => {
  const normal = partida({ letterSet: 'normal' }, seeded(5));
  assert.ok(normal.alphabet!.letters.length < FULL_ALPHABET.length, 'o modo normal não deveria trazer o alfabeto inteiro');

  const hard = partida({ letterSet: 'hardcore' }, seeded(5));
  assert.equal(hard.alphabet!.letters, FULL_ALPHABET);
  assert.ok(canUseLetter(acesa(hard), 'X'), 'no hardcore o X precisa estar de pé');
});

test('o pavio do Alfabeto é mais longo e tem segurança maior', () => {
  const s = { ...DEFAULT_ALPHABET_SETTINGS };
  assert.deepEqual([s.minSeconds, s.maxSeconds], [30, 90]);
  const curto = drawFuse({ ...s, minSeconds: 1, maxSeconds: 2 }, fixo(0.01)) / 1000;
  assert.equal(curto, ALPHABET_RULES.safetySeconds, 'a segurança do Alfabeto é maior que a do clássico');

  const amostras = Array.from({ length: 100 }, (_, i) => drawFuse(s, fixo((i + 0.5) / 100)) / 1000);
  assert.ok(Math.min(...amostras) >= 30 && Math.max(...amostras) <= 90);
});

test('o tema não se repete na partida', () => {
  let state = partida({ totalRounds: 0 }, seeded(11));
  const vistos = new Set([state.alphabet!.themeId]);
  const rng = seeded(21);

  for (let i = 1; i < countThemes(DEFAULT_ALPHABET_SETTINGS); i++) {
    state = bombTick(acesa(state), T0 + 999_999);
    state = nextRound(state, rng);
    assert.equal(vistos.has(state.alphabet!.themeId), false, `repetiu "${state.alphabet!.name}"`);
    vistos.add(state.alphabet!.themeId);
  }
});

test('sanitize usa o padrão da variante e limpa o conjunto de letras', () => {
  const limpo = sanitizeBombSettings({ variant: 'alfabeto', categories: ['Comida', 'Inventada'], letterSet: 'nada' as never });
  assert.equal(limpo.variant, 'alfabeto');
  assert.deepEqual(limpo.categories, ['Comida']);
  assert.equal(limpo.letterSet, 'normal', 'valor desconhecido não pode virar hardcore por acidente');
  assert.deepEqual([limpo.minSeconds, limpo.maxSeconds], [30, 90], 'o Alfabeto tem faixa própria');

  // As categorias de um jogo não valem no outro.
  assert.deepEqual(sanitizeBombSettings({ variant: 'classico', categories: ['Comida', 'Natureza'] }).categories, ['Comida']);
});

/* ------------------------------------------------------------- acessórios */

test('acento e cedilha pertencem à letra base', () => {
  assert.equal(baseLetter('Água'), 'A');
  assert.equal(baseLetter('Ônibus'), 'O');
  assert.equal(baseLetter('çapata'), 'C');
  assert.equal(baseLetter('  Êxodo'), 'E');
  assert.equal(baseLetter(''), '');
});

test('o destaque do Alfabeto é o mestre das letras, e não repete o sangue frio', () => {
  let state = acesa(partida({ totalRounds: 1 }));
  for (let i = 0; i < 4 && state.phase === 'armed'; i++) state = useLetter(state, remainingLetters(state)[0], T0 + (i + 1) * 600);
  if (state.phase === 'armed') state = bombTick(state, state.explodeAt!);

  const chaves = highlights(state).map((h) => h.key);
  assert.ok(chaves.includes('alfabeto'), 'faltou o mestre do alfabeto');
  assert.ok(!chaves.includes('frio'), 'sangue frio e mestre do alfabeto são o mesmo número aqui');
});

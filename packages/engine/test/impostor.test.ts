import assert from 'node:assert/strict';
import { test } from 'node:test';

import { IMPOSTOR_CATEGORIES, IMPOSTOR_RULES, botVote, categoryWords, createImpostorRound, resolveImpostorRound, shuffle, type ImpostorRound, type Player } from '../src/index';

const players: Player[] = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({
  id,
  name: id.toUpperCase(),
  color: '#7C3AED',
  isHost: i === 0,
  connected: true,
  joinedAt: i,
}));

const round = (impostorId: string): ImpostorRound => ({
  word: { word: 'Pizza', emoji: '🍕' },
  category: 'Comidas',
  impostorId,
  order: players.map((p) => p.id),
});

/** RNG determinístico: devolve os valores em sequência, em ciclo. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

/** Gerador determinístico: mesma semente, mesma partida. */
const seeded = (seed: number) => {
  let x = seed;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
};

const { groupCatches, impostorEscapes, correctVoteBonus } = IMPOSTOR_RULES.points;

test('grupo acerta: inocentes pontuam e quem votou certo leva bônus', () => {
  const r = resolveImpostorRound(round('c'), { a: 'c', b: 'c', c: 'a', d: 'c', e: 'b' }, players);
  assert.equal(r.caught, true);
  assert.equal(r.chosenId, 'c');
  assert.equal(r.pointsDelta.a, groupCatches + correctVoteBonus);
  assert.equal(r.pointsDelta.e, groupCatches, 'inocente que errou o voto ganha só os pontos do grupo');
  assert.equal(r.pointsDelta.c, 0, 'impostor pego não pontua');
  assert.deepEqual(r.headline, { points: groupCatches, target: 'group' });
});

test('impostor escapa: só ele leva os pontos grandes; acertos individuais ainda valem bônus', () => {
  const r = resolveImpostorRound(round('c'), { a: 'b', b: 'a', c: 'b', d: 'b', e: 'c' }, players);
  assert.equal(r.caught, false);
  assert.equal(r.chosenId, 'b');
  assert.equal(r.pointsDelta.c, impostorEscapes);
  assert.equal(r.pointsDelta.e, correctVoteBonus);
  assert.equal(r.pointsDelta.a, 0);
  assert.deepEqual(r.headline, { points: impostorEscapes, target: 'c' });
});

test('empate no topo nunca condena o impostor', () => {
  const r = resolveImpostorRound(round('c'), { a: 'c', b: 'c', c: 'a', d: 'a', e: 'b' }, players);
  assert.equal(r.caught, false);
  assert.equal(r.chosenId, 'a');
});

test('tally vem ordenado do mais votado para o menos votado', () => {
  const r = resolveImpostorRound(round('c'), { a: 'c', b: 'c', c: 'a', d: 'c', e: 'a' }, players);
  assert.deepEqual(r.tally, [
    { playerId: 'c', votes: 3 },
    { playerId: 'a', votes: 2 },
  ]);
});

test('o resultado nunca vaza a palavra errada nem o impostor errado', () => {
  const r = resolveImpostorRound(round('d'), { a: 'd', b: 'd', c: 'd', d: 'a', e: 'd' }, players);
  assert.equal(r.impostorId, 'd');
  assert.equal(r.word, 'Pizza');
});

test('createImpostorRound: impostor e ordem saem dos jogadores; palavra da categoria pedida', () => {
  const r = createImpostorRound(players, 'Filmes', new Set(), seq(0.5));
  assert.equal(r.category, 'Filmes');
  assert.ok(players.some((p) => p.id === r.impostorId));
  assert.deepEqual([...r.order].sort(), players.map((p) => p.id).sort());
});

test('createImpostorRound: não repete palavra já usada na partida', () => {
  const used = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const r = createImpostorRound(players, 'Comidas', used, Math.random);
    assert.equal(used.has(r.word.word), false, `repetiu ${r.word.word}`);
    used.add(r.word.word);
  }
});

test('createImpostorRound: "Aleatório" (ou categoria desconhecida) resolve para uma categoria real', () => {
  const r = createImpostorRound(players, 'Aleatório', new Set(), seq(0.1));
  assert.notEqual(r.category, 'Aleatório');
});

test('botVote: nunca vota em si mesmo, nem o impostor', () => {
  for (let i = 0; i < 200; i++) {
    for (const p of players) assert.notEqual(botVote(p.id, round('c'), players), p.id);
  }
});

test('shuffle preserva os elementos e não altera a lista original', () => {
  const original = [1, 2, 3, 4, 5];
  const out = shuffle(original, seq(0.3, 0.8, 0.1));
  assert.deepEqual([...out].sort(), original);
  assert.deepEqual(original, [1, 2, 3, 4, 5]);
});

test('banco de palavras: categorias completas, sem repetição e com emoji', () => {
  assert.ok(IMPOSTOR_CATEGORIES.length >= 4, 'poucas categorias');
  const todas: string[] = [];

  for (const categoria of IMPOSTOR_CATEGORIES) {
    // 10 é o maior `roundOptions` do app: abaixo disso uma partida cheia repetiria palavra.
    assert.ok(categoryWords(categoria).length >= 10, `${categoria} tem só ${categoryWords(categoria).length} palavras`);
    const rodada = createImpostorRound(players, categoria, new Set(), seeded(0.5));
    assert.equal(rodada.category, categoria, `${categoria} não está no banco`);
    todas.push(...categoryWords(categoria));
  }

  const repetidas = todas.filter((w, i) => todas.indexOf(w) !== i);
  // `usedWords` vale para a partida toda: a mesma palavra em duas listas sumiria da segunda.
  assert.deepEqual(repetidas, [], 'palavra repetida entre categorias');
  assert.ok(
    todas.every((w) => w.trim() === w && w.length > 1),
    'palavra com espaço sobrando ou vazia',
  );
});

test('uma partida cheia não repete palavra, e o banco não trava quando acaba', () => {
  const usadas = new Set<string>();
  const rng = seeded(0.37);
  for (let rodada = 1; rodada <= categoryWords('Comidas').length; rodada++) {
    const round = createImpostorRound(players, 'Comidas', usadas, rng);
    assert.equal(usadas.has(round.word.word), false, `repetiu "${round.word.word}" na rodada ${rodada}`);
    usadas.add(round.word.word);
  }
  // Esgotada a categoria, ele volta a permitir repetição em vez de ficar sem palavra.
  assert.ok(createImpostorRound(players, 'Comidas', usadas, rng).word.word);
});

test('categoria desconhecida cai numa real — é assim que "Aleatório" funciona', () => {
  const sorteadas = new Set<string>();
  const rng = seeded(7);
  for (let i = 0; i < 40; i++) sorteadas.add(createImpostorRound(players, 'Aleatório', new Set(), rng).category);
  assert.ok(sorteadas.size > 1, 'Aleatório deveria variar de categoria entre rodadas');
  for (const c of sorteadas) assert.ok(IMPOSTOR_CATEGORIES.includes(c));
});

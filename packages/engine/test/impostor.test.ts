import assert from 'node:assert/strict';
import { test } from 'node:test';

import { IMPOSTOR_RULES, botVote, createImpostorRound, resolveImpostorRound, shuffle, type ImpostorRound, type Player } from '../src/index';

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

/**
 * O catálogo é do app, mas as palavras são do engine. Se as duas listas saírem de sincronia,
 * nada quebra visivelmente: quem escolher uma categoria que o engine não conhece joga com outra,
 * sorteada em silêncio. Este teste é o que impede isso.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { IMPOSTOR_CATEGORIES, categoryWords } from '@jogae/engine';

import { GAMES, getGame } from '../src/features/catalog/data/games';

const impostor = getGame('impostor')!;
/** Não é uma lista de palavras: o engine sorteia uma categoria real a cada rodada. */
const ALEATORIO = 'Aleatório';

test('toda categoria oferecida na tela existe no banco de palavras do engine', () => {
  const oferecidas = impostor.wordCategories.map((c) => c.id).filter((id) => id !== ALEATORIO);
  assert.deepEqual(
    oferecidas.filter((id) => !IMPOSTOR_CATEGORIES.includes(id)),
    [],
    'categoria na tela que o engine não conhece',
  );
  assert.deepEqual(
    IMPOSTOR_CATEGORIES.filter((id) => !oferecidas.includes(id)),
    [],
    'categoria com palavras que ninguém consegue escolher',
  );
  assert.ok(impostor.wordCategories.some((c) => c.id === ALEATORIO), 'o chip Aleatório sumiu');
});

test('a categoria padrão é jogável e aguenta a maior partida sem repetir palavra', () => {
  assert.ok(IMPOSTOR_CATEGORIES.includes(impostor.defaults.category));
  const maiorPartida = Math.max(...impostor.roundOptions);
  for (const categoria of IMPOSTOR_CATEGORIES) {
    assert.ok(categoryWords(categoria).length >= maiorPartida, `${categoria} tem menos palavras que ${maiorPartida} rodadas`);
  }
});

test('só o impostor está jogável; os outros jogos não prometem categoria', () => {
  for (const game of GAMES.filter((g) => !g.playable)) {
    assert.deepEqual(game.wordCategories, [], `${game.id} não é jogável mas oferece categorias`);
  }
});

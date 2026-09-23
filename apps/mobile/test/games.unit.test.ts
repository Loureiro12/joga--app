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

test('a Bomba-Relógio é local: não passa por sala nem por motor de rede', () => {
  const bomba = getGame('bomba-relogio')!;
  assert.equal(bomba.playable, true);
  assert.equal(bomba.device, 'local');
  assert.equal(bomba.engineId, undefined, 'jogo local não pode apontar para um motor de sala');
  assert.equal(bomba.wordCategories.length, 0, 'as categorias dele ficam na própria tela de configuração');
});

test('todo jogo jogável sabe como começar: ou tem motor de sala, ou é local', () => {
  for (const game of GAMES.filter((g) => g.playable)) {
    assert.ok(game.engineId || game.device === 'local', `${game.id} está jogável mas não diz por onde começa`);
    assert.ok(game.minPlayers <= game.recommendedPlayers, `${game.id}: o piso não pode passar do recomendado`);
    assert.ok(game.recommendedPlayers <= game.maxPlayers, `${game.id}: o recomendado não cabe no teto`);
  }
});

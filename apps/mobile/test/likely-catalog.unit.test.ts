/**
 * O catálogo (app) e o motor (engine) são listas separadas. Se saírem de sincronia, nada quebra
 * visivelmente: quem escolher uma categoria que o motor não conhece joga com outra, sorteada em
 * silêncio. Estes testes cobrem o "Quem é Mais Provável?" — o par do Impostor está em games.unit.test.ts.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LIKELY_CATEGORIES, LIKELY_RULES, countQuestions, DEFAULT_LIKELY_SETTINGS } from '@jogae/engine';

import { getGame } from '../src/features/catalog/data/games';

const jogo = getGame('mais-provavel')!;
/** Não é categoria: é a ausência de filtro. */
const ANY = 'Aleatório';

test('o jogo está ligado ao motor certo e cabe nos limites dele', () => {
  assert.equal(jogo.engineId, 'likely');
  assert.equal(jogo.playable, true);
  assert.ok(jogo.minPlayers >= LIKELY_RULES.minPlayers, 'a tela deixaria criar sala com gente de menos');
  assert.ok(jogo.maxPlayers <= LIKELY_RULES.maxPlayers, 'a tela deixaria passar do teto do motor');
});

test('as categorias da tela são exatamente as do banco de perguntas', () => {
  const oferecidas = jogo.wordCategories.map((c) => c.id).filter((id) => id !== ANY);
  assert.deepEqual(oferecidas, [...LIKELY_CATEGORIES], 'tela e banco divergiram');
  assert.ok(jogo.wordCategories.some((c) => c.id === ANY), 'o chip Aleatório sumiu');
});

test('a maior partida cabe no banco sem repetir pergunta', () => {
  // `0` é "sem limite": aí a repetição é inevitável e o motor reembaralha de propósito.
  const maior = Math.max(...jogo.roundOptions);
  assert.ok(countQuestions(DEFAULT_LIKELY_SETTINGS) >= maior, `${maior} rodadas não cabem no baralho padrão`);

  // Até a configuração mais estreita (uma categoria, só leve) aguenta a partida mais curta.
  const menor = Math.min(...jogo.roundOptions.filter((n) => n > 0));
  for (const categoria of LIKELY_CATEGORIES) {
    const cabe = countQuestions({ ...DEFAULT_LIKELY_SETTINGS, categories: [categoria], intensities: ['leve'] });
    assert.ok(cabe >= menor, `${categoria} só tem ${cabe} perguntas leves, e a partida mais curta pede ${menor}`);
  }
});

test('a opção sem limite existe e o padrão é uma partida finita', () => {
  assert.ok(jogo.roundOptions.includes(0), 'faltou a opção sem limite');
  assert.ok(jogo.defaults.rounds > 0, 'o padrão não pode ser a partida infinita');
  assert.ok(jogo.roundOptions.includes(jogo.defaults.rounds));
});

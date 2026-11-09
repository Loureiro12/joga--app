/**
 * A memória de conteúdo da Bomba-Relógio.
 *
 * A queixa que originou isto: "os jogos de bomba geram palavras repetidas". Havia duas causas, e
 * a maior não tinha nada a ver com o tamanho do banco — era a memória. `usedChallengeIds` garante
 * que nada repita dentro de uma partida, e é jogado fora no fim; então um grupo que jogava toda
 * semana recomeçava o sorteio do zero toda semana. Com 180 cartas, reencontrar as mesmas é o
 * resultado esperado, não azar.
 *
 * Este arquivo testa a correção. O motor usa `seenIds` para sortear (ver
 * `packages/engine/test/bomb-repeticao.test.ts`); aqui se testa quem monta essa lista, decide se
 * vale gastar uma chamada de API, e o que fazer quando a cota de disco aperta.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countChallenges, DEFAULT_ALPHABET_SETTINGS, DEFAULT_BOMB_SETTINGS, sanitizeGeneratedChallenges, type BombChallenge } from '@jogae/engine';

import {
  INTERVALO_MS,
  MAX_AVOID,
  MAX_CHALLENGES,
  MAX_SEEN,
  MEMORIA_VAZIA,
  PISO_PARA_BUSCAR,
  absorver,
  assinatura,
  avoidTexts,
  contentFor,
  freshCount,
  juntar,
  remember,
  shouldPrefetch,
  type Memoria,
  type Opcoes,
} from '../src/features/bomb/contentMemory';

const AGORA = 1_700_000_000_000;

const opcoes = (over: Partial<Opcoes> = {}): Opcoes => ({ variant: 'classico', categories: [], difficulties: ['facil', 'medio'], ...over });
const memoria = (over: Partial<Memoria> = {}): Memoria => ({ ...MEMORIA_VAZIA, ...over });

/** Cartas que passam pela portaria do motor — nada de objeto inventado à mão. */
function geradas(quantas: number, category = 'Festa', difficulty: BombChallenge['difficulty'] = 'facil'): BombChallenge[] {
  const cru = Array.from({ length: quantas }, (_, i) => ({ text: `Diga algo que cabe numa gaveta número ${i}.`, category, difficulty, pool: 'alto' }));
  const ok = sanitizeGeneratedChallenges(cru, { categories: [category], difficulties: [difficulty] });
  assert.equal(ok.length, quantas, 'as cartas de teste não passaram pela portaria');
  return ok;
}

/* ──────────────────────── o que vai para o motor ──────────────────────── */

test('sem nada guardado, o motor não recebe conteúdo nenhum', () => {
  const content = contentFor(MEMORIA_VAZIA, opcoes());
  assert.deepEqual(content, { challenges: [], themes: [], seenIds: [] });
});

test('só vai para o baralho o que serve às opções escolhidas', () => {
  // Carta de outra categoria faria o motor filtrar de novo à toa, e o contador da tela contaria
  // carta que nunca sairia.
  const m = memoria({ challenges: [...geradas(3, 'Festa'), ...geradas(2, 'Comida')] });
  assert.equal(contentFor(m, opcoes({ categories: ['Festa'] })).challenges.length, 3);
  assert.equal(contentFor(m, opcoes({ categories: [] })).challenges.length, 5, 'sem categoria marcada vale tudo');
  assert.equal(contentFor(m, opcoes({ difficulties: ['dificil'] })).challenges.length, 0);
});

test('desafio não vai para o Alfabeto, nem tema para o clássico', () => {
  const m = memoria({ challenges: geradas(3), themes: [{ id: 'ia-t-x', name: 'Bichos', emoji: '🦊', category: 'Natureza', difficulty: 'facil', letters: 'ABCDEFGHIJLMNO' }] });
  const classico = contentFor(m, opcoes({ variant: 'classico' }));
  assert.equal(classico.challenges.length, 3);
  assert.deepEqual(classico.themes, [], 'tema vazou para o clássico');

  const alfabeto = contentFor(m, { variant: 'alfabeto', categories: ['Natureza'], difficulties: ['facil'] });
  assert.equal(alfabeto.themes.length, 1);
  assert.deepEqual(alfabeto.challenges, [], 'desafio vazou para o Alfabeto');
});

test('a memória de vistos vai inteira, sem filtro de categoria', () => {
  // Ela é só uma lista de ids; filtrar por categoria exigiria reler o banco, e não há ganho:
  // id que não está no baralho da vez simplesmente não casa com nada.
  const m = memoria({ seenIds: ['ger-001', 'fes-003', 'ia-d-abc'] });
  assert.deepEqual(contentFor(m, opcoes({ categories: ['Festa'] })).seenIds, ['ger-001', 'fes-003', 'ia-d-abc']);
});

/* ──────────────────────── guardar o que foi usado ──────────────────────── */

test('o que a partida usou entra na memória', () => {
  const depois = remember(MEMORIA_VAZIA, ['fes-001', 'fes-002']);
  assert.deepEqual(depois.seenIds, ['fes-001', 'fes-002']);
});

test('uma partida sem rodada nenhuma não mexe na memória', () => {
  const antes = memoria({ seenIds: ['fes-001'] });
  assert.equal(remember(antes, []), antes, 'devolveu objeto novo sem ter o que guardar');
});

test('carta repetida vai para o fim da fila, não duplica', () => {
  // Importa porque o teto corta pelo começo: duplicar empurraria carta inocente para fora.
  const depois = remember(memoria({ seenIds: ['a', 'b', 'c'] }), ['b']);
  assert.deepEqual(depois.seenIds, ['a', 'c', 'b']);
});

test('a memória tem teto, e quem sai é o mais antigo', () => {
  const cheia = memoria({ seenIds: Array.from({ length: MAX_SEEN }, (_, i) => `v${i}`) });
  const depois = remember(cheia, ['novo-1', 'novo-2']);
  assert.equal(depois.seenIds.length, MAX_SEEN);
  assert.ok(!depois.seenIds.includes('v0'), 'o mais antigo deveria ter saído');
  assert.ok(!depois.seenIds.includes('v1'));
  assert.deepEqual(depois.seenIds.slice(-2), ['novo-1', 'novo-2']);
});

/* ──────────────────────── vale gastar uma chamada? ──────────────────────── */

test('com carta inédita de sobra, não busca: cada chamada custa dinheiro', () => {
  const estado = { buscando: false, ultimaBusca: null, agora: AGORA };
  // O banco inteiro do clássico, intocado.
  const bankCount = countChallenges(DEFAULT_BOMB_SETTINGS);
  assert.ok(bankCount > PISO_PARA_BUSCAR);
  assert.equal(shouldPrefetch(MEMORIA_VAZIA, opcoes(), bankCount, estado), false);
});

test('com o banco quase esgotado, busca', () => {
  const vistos = Array.from({ length: 14 }, (_, i) => `fes-${i}`);
  const o = opcoes({ categories: ['Festa'] });
  const bankCount = countChallenges({ ...DEFAULT_BOMB_SETTINGS, ...o });
  assert.ok(bankCount - vistos.length < PISO_PARA_BUSCAR, `o cenário precisa de banco apertado (${bankCount} cartas)`);
  assert.equal(shouldPrefetch(memoria({ seenIds: vistos }), o, bankCount, { buscando: false, ultimaBusca: null, agora: AGORA }), true);
});

test('o Alfabeto com uma categoria marcada pede geração de saída', () => {
  // 3 temas contra 5 rodadas: é o caso que motivou a feature, e precisa disparar sozinho.
  const o: Opcoes = { variant: 'alfabeto', categories: ['Natureza'], difficulties: DEFAULT_ALPHABET_SETTINGS.difficulties };
  assert.equal(shouldPrefetch(MEMORIA_VAZIA, o, 3, { buscando: false, ultimaBusca: null, agora: AGORA }), true);
});

test('não busca duas vezes para a mesma configuração em poucos minutos', () => {
  const o = opcoes({ categories: ['Festa'] });
  const m = memoria({ seenIds: Array.from({ length: 14 }, (_, i) => `fes-${i}`) });
  const bankCount = countChallenges({ ...DEFAULT_BOMB_SETTINGS, ...o });

  assert.equal(shouldPrefetch(m, o, bankCount, { buscando: false, ultimaBusca: AGORA - 1000, agora: AGORA }), false);
  assert.equal(shouldPrefetch(m, o, bankCount, { buscando: false, ultimaBusca: AGORA - INTERVALO_MS - 1, agora: AGORA }), true);
});

test('uma busca em curso impede a próxima: mexer no chip não vira uma chamada por toque', () => {
  const o = opcoes({ categories: ['Festa'] });
  const m = memoria({ seenIds: Array.from({ length: 14 }, (_, i) => `fes-${i}`) });
  assert.equal(shouldPrefetch(m, o, countChallenges({ ...DEFAULT_BOMB_SETTINGS, ...o }), { buscando: true, ultimaBusca: null, agora: AGORA }), false);
});

test('a assinatura ignora a ordem das categorias', () => {
  // Sem isso, marcar "Festa, Caos" e "Caos, Festa" contariam como duas configurações e cada
  // reordenação na tela viraria uma chamada nova.
  assert.equal(assinatura(opcoes({ categories: ['Festa', 'Caos'] })), assinatura(opcoes({ categories: ['Caos', 'Festa'] })));
  assert.notEqual(assinatura(opcoes({ variant: 'classico' })), assinatura(opcoes({ variant: 'alfabeto' })));
  assert.notEqual(assinatura(opcoes({ difficulties: ['facil'] })), assinatura(opcoes({ difficulties: ['facil', 'medio'] })));
});

/* ──────────────────────── a conta de inéditas ──────────────────────── */

test('a conta soma banco e geradas, e desconta o que já foi visto', () => {
  const o = opcoes({ categories: ['Festa'], difficulties: ['facil'] });
  const m = memoria({ seenIds: ['fes-001', 'fes-002'], challenges: geradas(4, 'Festa', 'facil') });
  assert.equal(freshCount(m, o, 10), 10 - 2 + 4);
});

test('id de carta gerada não é descontado do banco local', () => {
  // Os prefixos existem para isto: descontar uma carta de IA do total do banco faria a conta
  // encolher duas vezes pela mesma carta.
  const o = opcoes({ categories: ['Festa'], difficulties: ['facil'] });
  const cartas = geradas(3, 'Festa', 'facil');
  const m = memoria({ seenIds: cartas.map((c) => c.id), challenges: cartas });
  assert.equal(freshCount(m, o, 10), 10, 'a conta descontou carta de IA do banco local');
});

test('a conta nunca fica negativa', () => {
  const m = memoria({ seenIds: Array.from({ length: 50 }, (_, i) => `ger-${i}`) });
  assert.equal(freshCount(m, opcoes(), 10), 0);
});

/* ──────────────────────── o pedido que vai ao servidor ──────────────────────── */

test('o pedido leva as frases que o grupo tem na mão, com teto', () => {
  const m = memoria({ challenges: geradas(MAX_AVOID + 20) });
  const lista = avoidTexts(m, opcoes({ categories: ['Festa'] }));
  assert.equal(lista.length, MAX_AVOID, 'o prompt cresceria sem limite');
  // As mais novas: são as que o grupo acabou de ver.
  assert.equal(lista.at(-1), m.challenges.at(-1)!.text);
});

test('no Alfabeto o pedido leva nomes de tema, não enunciados', () => {
  const m = memoria({
    challenges: geradas(2),
    themes: [{ id: 'ia-t-x', name: 'Bichos do mato', emoji: '🦊', category: 'Natureza', difficulty: 'facil', letters: 'ABCDEFGHIJLMNO' }],
  });
  assert.deepEqual(avoidTexts(m, { variant: 'alfabeto', categories: [], difficulties: ['facil'] }), ['Bichos do mato']);
});

/* ──────────────────────── absorver o lote ──────────────────────── */

test('lote novo entra; carta que o grupo já viu é descartada na entrada', () => {
  const cartas = geradas(4);
  const m = memoria({ seenIds: [cartas[0].id] });
  const depois = absorver(m, { challenges: cartas, themes: [] });
  assert.equal(depois.challenges.length, 3);
  assert.ok(!depois.challenges.some((c) => c.id === cartas[0].id), 'guardou carta já vista');
});

test('lote que não trouxe nada novo não mexe no estado', () => {
  // Importa para a tela: `setState` com objeto novo causaria render à toa a cada busca vazia.
  const cartas = geradas(2);
  const m = memoria({ seenIds: cartas.map((c) => c.id) });
  assert.equal(absorver(m, { challenges: cartas, themes: [] }), m);
  assert.equal(absorver(m, { challenges: [], themes: [] }), m);
});

test('o mesmo lote duas vezes não duplica carta', () => {
  const cartas = geradas(3);
  const uma = absorver(MEMORIA_VAZIA, { challenges: cartas, themes: [] });
  const duas = absorver(uma, { challenges: cartas, themes: [] });
  assert.equal(duas.challenges.length, 3);
  assert.equal(new Set(duas.challenges.map((c) => c.id)).size, 3);
});

test('o teto de disco corta as mais antigas, não as recém-geradas', () => {
  const antigas = geradas(MAX_CHALLENGES);
  const novas = sanitizeGeneratedChallenges(
    Array.from({ length: 5 }, (_, i) => ({ text: `Diga algo que cabe numa mochila nova ${i}.`, category: 'Festa', difficulty: 'facil', pool: 'alto' })),
    { categories: ['Festa'] },
  );
  const depois = absorver(memoria({ challenges: antigas }), { challenges: novas, themes: [] });
  assert.equal(depois.challenges.length, MAX_CHALLENGES);
  for (const nova of novas) assert.ok(depois.challenges.some((c) => c.id === nova.id), 'carta recém-gerada foi cortada pelo teto');
});

test('juntar mantém a ordem e prefere a versão nova de uma carta repetida', () => {
  const a = { id: 'x', n: 1 };
  const b = { id: 'y', n: 2 };
  assert.deepEqual(juntar([a, b], [{ id: 'x', n: 9 }], 10), [b, { id: 'x', n: 9 }]);
  assert.deepEqual(juntar([a, b], [], 1), [b], 'o teto deveria cortar pelo começo');
});

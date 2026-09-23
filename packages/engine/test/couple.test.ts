import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CARDS } from '../src/games/couple-cards';
import {
  COUPLE_CATEGORIES,
  COUPLE_LENGTHS,
  INTIMATE_CATEGORY,
  countCards,
  createCoupleSession,
  deepen,
  depthFor,
  endSession,
  nextCard,
  order,
  sanitizeCoupleSettings,
  sessionSummary,
  swapCard,
  type CoupleMood,
  type CoupleSettings,
  type CoupleState,
} from '../src/index';

const seeded = (seed: number) => {
  let x = seed;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
};
const base = (over: Partial<CoupleSettings> = {}): Partial<CoupleSettings> => ({ names: ['Ana', 'Bia'], ...over });

/** Roda a sessão inteira e devolve as cartas na ordem em que saíram. */
function sessao(over: Partial<CoupleSettings> = {}, rng = seeded(7)) {
  let state = createCoupleSession(base(over), rng);
  const cartas = [state.card!];
  while (!state.finished) {
    const proximo = nextCard(state, rng);
    if (proximo.finished) break;
    state = proximo;
    cartas.push(state.card!);
  }
  return { state, cartas };
}

/* ------------------------------------------------------------------ cartas */

test('banco de cartas: categorias certas, sem repetição e com follow-up onde importa', () => {
  // 170, e não um número redondo, porque as cotas por categoria é que mandam: cortar cartas boas
  // só para fechar a conta deixaria as categorias desequilibradas.
  assert.equal(CARDS.length, 170);
  assert.deepEqual([...new Set(CARDS.map((c) => c.category))].sort(), [...COUPLE_CATEGORIES].sort());

  const ids = CARDS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'id repetido');
  const textos = CARDS.map((c) => c.text);
  assert.equal(new Set(textos).size, textos.length, 'carta repetida');

  for (const c of CARDS) {
    assert.equal(c.text[0], c.text[0].toUpperCase(), `"${c.text}" não começa em maiúscula`);
    if (c.kind === 'pergunta') {
      assert.ok(c.text.endsWith('?'), `"${c.text}" é pergunta e não termina em ?`);
      // Sem a segunda camada, o botão "Aprofundar" não teria o que oferecer.
      assert.ok((c.followUps ?? []).length >= 1, `"${c.text}" não tem follow-up`);
    } else {
      assert.ok(c.text.endsWith('.'), `ação "${c.text}" deveria terminar em ponto`);
      assert.equal(c.followUps, undefined, 'ação não tem follow-up');
    }
    // Marcação de gênero entre parênteses deixa o texto feio de ler em voz alta.
    assert.ok(!/\((a|o)\)|\/(a|o)\b/i.test(c.text), `"${c.text}" marca gênero entre parênteses`);
  }

  // Promessas de conteúdo que a tela faz ao casal.
  assert.ok(
    CARDS.filter((c) => c.category === 'Leve e divertido').every((c) => c.depth === 'leve'),
    'a categoria leve tem carta pesada',
  );
  assert.ok(
    CARDS.filter((c) => c.category === INTIMATE_CATEGORY).every((c) => c.depth === 'intimidade'),
    'a categoria de intimidade tem carta de outra profundidade',
  );
  assert.ok(CARDS.some((c) => c.kind === 'acao'), 'faltaram as cartas de ação');
});

/* ------------------------------------------------------------- intimidade */

test('intimidade só aparece quando o casal escolhe esse clima', () => {
  for (const mood of ['leve', 'conectar', 'profundo', 'surpresa'] as CoupleMood[]) {
    const { cartas } = sessao({ mood, total: 20 }, seeded(3));
    assert.ok(
      cartas.every((c) => c.category !== INTIMATE_CATEGORY && c.depth !== 'intimidade'),
      `o clima "${mood}" deixou passar carta de intimidade`,
    );
  }

  // Nem pedindo a categoria na mão: sem o clima, ela é filtrada.
  const forcado = sanitizeCoupleSettings({ mood: 'conectar', categories: [INTIMATE_CATEGORY, 'Futuro'] });
  assert.deepEqual(forcado.categories, ['Futuro']);

  const { cartas } = sessao({ mood: 'intimidade', total: 20 }, seeded(9));
  assert.ok(cartas.some((c) => c.depth === 'intimidade'), 'o clima de intimidade não trouxe nenhuma');
  // Mas nunca logo de cara: a conversa precisa andar antes.
  assert.ok(cartas.slice(0, 3).every((c) => c.depth !== 'intimidade'), 'intimidade apareceu nas primeiras cartas');
});

/* -------------------------------------------------------------- progressão */

test('a sessão começa leve e vai fundo — nunca o contrário', () => {
  const { cartas } = sessao({ mood: 'profundo', total: 20 }, seeded(5));
  assert.equal(cartas.length, 20);

  const peso: Record<string, number> = { leve: 0, conectar: 1, profundo: 2, intimidade: 2 };
  const inicio = cartas.slice(0, 5).reduce((n, c) => n + peso[c.depth], 0) / 5;
  const fim = cartas.slice(-5).reduce((n, c) => n + peso[c.depth], 0) / 5;
  assert.ok(fim > inicio, `a conversa não aprofundou: começo ${inicio.toFixed(2)}, fim ${fim.toFixed(2)}`);
  assert.equal(cartas[0].depth, 'leve', 'a primeira carta precisa ser leve');
});

test('não vira interrogatório: profundas seguidas têm limite', () => {
  const { cartas } = sessao({ mood: 'profundo', total: 20 }, seeded(13));
  let seguidas = 0;
  let pior = 0;
  for (const c of cartas) {
    seguidas = c.depth === 'leve' ? 0 : seguidas + 1;
    pior = Math.max(pior, seguidas);
  }
  assert.ok(pior <= 3, `${pior} cartas fundas seguidas sem respiro`);
});

test('o clima leve não puxa nada além de leve', () => {
  const { cartas } = sessao({ mood: 'leve', total: 20 }, seeded(2));
  assert.ok(cartas.every((c) => c.depth === 'leve'));
  assert.equal(depthFor(19, 20, 'leve'), 'leve', 'nem no fim da sessão');
});

/* ------------------------------------------------------------------ sessão */

test('quem responde primeiro alterna a cada carta', () => {
  let state = createCoupleSession(base({ total: 5 }), seeded(4));
  const primeiros = [order(state)[0]];
  for (let i = 0; i < 4; i++) {
    state = nextCard(state, seeded(i + 1));
    primeiros.push(order(state)[0]);
  }
  for (let i = 1; i < primeiros.length; i++) {
    assert.notEqual(primeiros[i], primeiros[i - 1], 'a mesma pessoa abriu duas cartas seguidas');
  }
  assert.deepEqual([...new Set(primeiros)].sort(), ['Ana', 'Bia']);
});

test('a carta não se repete na sessão, e a sessão acaba no número combinado', () => {
  const { state, cartas } = sessao({ total: 10 }, seeded(17));
  assert.equal(cartas.length, 10);
  assert.equal(new Set(cartas.map((c) => c.id)).size, 10, 'carta repetida na mesma sessão');
  assert.equal(nextCard(state, seeded(1)).finished, true);
});

test('conversa livre não acaba sozinha', () => {
  let state = createCoupleSession(base({ total: 0 }), seeded(8));
  for (let i = 0; i < 25; i++) {
    state = nextCard(state, seeded(i));
    assert.equal(state.finished, false, `acabou sozinha na carta ${i + 2}`);
  }
  assert.equal(endSession(state).finished, true);
});

test('trocar a carta não gasta a vez nem mexe em quem começa', () => {
  const state = createCoupleSession(base({ total: 10 }), seeded(6));
  const trocado = swapCard(state, seeded(31));

  assert.notEqual(trocado.card!.id, state.card!.id, 'veio a mesma carta');
  assert.equal(trocado.index, state.index, 'trocar não pode avançar a sessão');
  assert.equal(trocado.firstIndex, state.firstIndex, 'quem começa continua o mesmo');
  // A descartada sai do resumo: o casal não conversou sobre ela.
  assert.equal(sessionSummary(trocado).total, 1);
});

test('aprofundar abre a segunda camada sem trocar de assunto', () => {
  let state = createCoupleSession(base({ total: 10 }), seeded(12));
  // Procura uma carta com follow-up (as de ação não têm).
  while (!(state.card?.followUps ?? []).length) state = nextCard(state, seeded(state.index + 40));

  const fundo = deepen(state, seeded(2));
  assert.ok(fundo.followUp, 'não abriu o follow-up');
  assert.ok(state.card!.followUps!.includes(fundo.followUp!), 'o follow-up veio de outra carta');
  assert.equal(fundo.card!.id, state.card!.id, 'aprofundar não pode trocar a carta');
  assert.equal(fundo.index, state.index);

  // Virar a carta limpa a segunda camada.
  assert.equal(nextCard(fundo, seeded(3)).followUp, null);

  // Carta de ação não tem o que aprofundar, e o botão não deve fazer nada.
  const acao: CoupleState = { ...state, card: { id: 'x', kind: 'acao', category: 'Amor e carinho', depth: 'leve', text: 'Dê um abraço demorado.' } };
  assert.equal(deepen(acao, seeded(1)), acao);
});

/* ------------------------------------------------------------ configuração */

test('o resumo conta sobre o que se conversou, e nada de desempenho', () => {
  const { state } = sessao({ total: 10, mood: 'profundo' }, seeded(23));
  const resumo = sessionSummary(state);
  assert.equal(resumo.total, 10);
  assert.ok(resumo.byCategory.length > 1, 'uma sessão de 10 cartas não deveria ficar num tema só');
  assert.ok(resumo.byCategory.every((c) => c.count > 0));
  // Ordenado do mais falado para o menos: é o que o casal quer ver primeiro.
  for (let i = 1; i < resumo.byCategory.length; i++) assert.ok(resumo.byCategory[i - 1].count >= resumo.byCategory[i].count);
});

test('sanitize protege os nomes, o clima e a duração', () => {
  const limpo = sanitizeCoupleSettings({ names: ['  André com um nome muito comprido  ', ''], mood: 'inventado' as never, total: 7 });
  assert.equal(limpo.names[0].length <= 16, true);
  assert.ok(limpo.names[1].length > 0, 'nome vazio precisa de um rótulo, senão a tela fica quebrada');
  assert.equal(limpo.mood, 'conectar');
  assert.ok((COUPLE_LENGTHS as readonly number[]).includes(limpo.total), 'duração fora das opções');
  assert.ok(countCards(limpo) > 0);
});

test('mesmo com uma categoria só, a sessão tem carta para dar', () => {
  for (const categoria of COUPLE_CATEGORIES) {
    const mood: CoupleMood = categoria === INTIMATE_CATEGORY ? 'intimidade' : 'profundo';
    const quantas = countCards(sanitizeCoupleSettings({ mood, categories: [categoria] }));
    assert.ok(quantas >= 10, `${categoria} só tem ${quantas} cartas — uma sessão de 10 repetiria`);
  }
});

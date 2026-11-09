import assert from 'node:assert/strict';
import { test } from 'node:test';

import { THEMES } from '../src/games/alphabet-themes';
import { CHALLENGES } from '../src/games/bomb-challenges';
import {
  ALPHABET_RULES,
  MAX_CONTENT_COUNT,
  hasBlockedTopic,
  isAiGenerated,
  sanitizeContentRequest,
  sanitizeGeneratedChallenges,
  sanitizeGeneratedThemes,
  type BombChallenge,
} from '../src/index';

/**
 * A portaria do conteúdo gerado por IA.
 *
 * Este arquivo é a razão de a geração poder existir. O banco escrito à mão respeita critérios que
 * um modelo não pode ser *obrigado* a respeitar — só instruído. Então nada entra no jogo sem
 * passar por `sanitizeGenerated*`, e o que se testa aqui é justamente a carta ruim: a frase longa,
 * o nome próprio, o assunto proibido, o tema curto que travaria a roda.
 *
 * Um lote que volta pela metade é um lote menor. É aceitável, e é o desenho: o banco local
 * completa. Um lote que volta com uma carta fora dos critérios não é aceitável em nenhum caso.
 */

const desafio = (campos: Partial<Record<string, unknown>> = {}) => ({
  text: 'Diga algo que cabe numa mochila.',
  category: 'Conhecimentos gerais',
  difficulty: 'facil',
  pool: 'alto',
  ...campos,
});

const tema = (campos: Partial<Record<string, unknown>> = {}) => ({
  name: 'Coisas de praia',
  emoji: '🏖',
  category: 'Lugares',
  difficulty: 'facil',
  letters: 'ABCDEFGILMOPRSTU',
  ...campos,
});

const um = (campos?: Partial<Record<string, unknown>>) => sanitizeGeneratedChallenges([desafio(campos)]);
const umTema = (campos?: Partial<Record<string, unknown>>) => sanitizeGeneratedThemes([tema(campos)]);

/* ───────────────────────── o caminho felizes ───────────────────────── */

test('uma carta que respeita os critérios passa, e sai pronta para o jogo', () => {
  const [carta] = um();
  assert.ok(carta, 'a carta boa foi recusada');
  assert.equal(carta.text, 'Diga algo que cabe numa mochila.');
  assert.equal(carta.category, 'Conhecimentos gerais');
  assert.equal(carta.difficulty, 'facil');
  assert.equal(carta.pool, 'alto');
  assert.ok(isAiGenerated(carta.id), `id de IA deveria ser reconhecível: ${carta.id}`);
});

test('o id vem do texto, então é o mesmo em toda geração', () => {
  // É o que faz a memória de "já vi essa" funcionar: se o id mudasse a cada chamada, a mesma
  // carta voltaria para a mesa como se fosse nova.
  const [a] = um();
  const [b] = um({ difficulty: 'medio' });
  assert.equal(a.id, b.id, 'o id mudou sem o texto mudar');

  const [outra] = um({ text: 'Diga algo que cabe num bolso.' });
  assert.notEqual(a.id, outra.id, 'textos diferentes geraram o mesmo id');
});

test('nenhum id gerado colide com o banco local', () => {
  const doBanco = new Set([...CHALLENGES.map((c) => c.id), ...THEMES.map((t) => t.id)]);
  const gerados = [...um(), ...umTema()];
  for (const item of gerados) assert.ok(!doBanco.has(item.id), `id gerado colidiu com o banco: ${item.id}`);
});

/* ─────────────────────────── forma da frase ─────────────────────────── */

test('o enunciado é uma frase só, no imperativo, terminada em ponto', () => {
  const recusados = [
    { text: 'Uma cor qualquer.', por: 'não começa com Diga/Cite/Fale' },
    { text: 'Diga uma cor', por: 'sem ponto final' },
    { text: 'Diga uma cor?', por: 'interrogação' },
    { text: 'Diga uma cor!', por: 'exclamação' },
    { text: 'Diga uma cor. Agora diga outra.', por: 'duas frases' },
    { text: 'Diga uma "cor".', por: 'aspas' },
    { text: 'Diga.', por: 'curto demais' },
    { text: `Diga ${'algo muito comprido '.repeat(6)}.`, por: 'longo demais' },
  ];
  for (const { text, por } of recusados) assert.equal(um({ text }).length, 0, `deveria recusar (${por}): ${text}`);
});

test('os três verbos do banco, e só eles', () => {
  for (const verbo of ['Diga', 'Cite', 'Fale']) {
    assert.equal(um({ text: `${verbo} algo que cabe numa mochila.` }).length, 1, `${verbo} deveria passar`);
  }
  for (const verbo of ['Nomeie', 'Pense', 'Escolha', 'Liste']) {
    assert.equal(um({ text: `${verbo} algo que cabe numa mochila.` }).length, 0, `${verbo} não é do banco`);
  }
});

test('nome próprio no meio da frase é recusado — pessoa, marca ou obra', () => {
  const comNome = [
    'Diga uma música da Anitta.',
    'Diga uma série da HBO.',
    'Cite um jogador do Flamengo.',
    'Diga um filme da Marvel.',
    'Diga um país da América do Sul.',
  ];
  for (const text of comNome) assert.equal(um({ text }).length, 0, `deveria recusar nome próprio: ${text}`);

  // A última da lista existe no banco local escrito à mão, e isso é de propósito: a mão humana
  // distingue lugar de pessoa, um teste de maiúscula não. Como o banco já cobre geografia, o
  // gerado fica no vocabulário comum — e em troca a regra fica curta o bastante para confiar.
  assert.ok(CHALLENGES.some((c) => c.text === 'Diga um país da América do Sul.'));
});

/* ──────────────────────── assuntos proibidos ──────────────────────── */

test('os assuntos fora dos critérios do banco não passam', () => {
  const proibidos = [
    'Diga um sintoma de gripe.',
    'Diga algo que te deixa ansioso.',
    'Diga uma parte do corpo que você acha feia.',
    'Diga uma religião.',
    'Diga um crime comum.',
    'Diga uma arma branca.',
    'Diga um tipo de droga.',
    'Diga uma posição sexual.',
    'Cite um presidente.',
    'Diga uma dívida que todo mundo tem.',
    'Diga um remédio de farmácia.',
  ];
  for (const text of proibidos) assert.equal(um({ text }).length, 0, `deveria recusar assunto proibido: ${text}`);
});

test('a lista de recusa tem limite, e o limite é conhecido', () => {
  // "Diga algo que acontece na cama." passa, e passar é o certo para esta lista: bloquear a
  // palavra "cama" derrubaria "camarão" junto. Insinuação é coisa que só o prompt consegue
  // julgar; a lista cuida do que é literal. Está escrito aqui para não parecer um esquecimento.
  assert.equal(um({ text: 'Diga algo que acontece na cama.' }).length, 1);
});

test('a recusa ignora acento e caixa: não dá para escapar pela grafia', () => {
  for (const text of ['Diga um CRIME comum.', 'Diga um sintóma de gripe.', 'Diga uma religiao.']) {
    assert.equal(um({ text }).length, 0, `escapou pela grafia: ${text}`);
  }
});

test('a lista de recusa não é larga demais: o banco escrito à mão passa inteiro por ela', () => {
  // O risco oposto ao do teste acima, e mais difícil de notar: um radical largo ('mort' pegando
  // 'mortadela', 'cren' pegando 'creme') não quebra nada — só faz a geração render menos, em
  // silêncio. As 180 cartas e os 18 temas humanos são a régua.
  const pegos = [...CHALLENGES.map((c) => c.text), ...THEMES.map((t) => t.name)].filter(hasBlockedTopic);
  assert.deepEqual(pegos, [], `a lista de recusa está derrubando conteúdo bom: ${pegos.join(' · ')}`);
});

/* ───────────────────────── categoria e pool ───────────────────────── */

test('categoria fora das escolhidas não entra, mesmo sendo boa', () => {
  const lote = [desafio({ category: 'Comida', text: 'Diga algo que combina com queijo.' }), desafio({ category: 'Games', text: 'Diga algo que existe num jogo.' })];
  const so = sanitizeGeneratedChallenges(lote, { categories: ['Comida'] });
  assert.equal(so.length, 1);
  assert.equal(so[0].category, 'Comida');
});

test('categoria que não existe no jogo é recusada', () => {
  assert.equal(um({ category: 'Fofoca' }).length, 0);
});

test('dificuldade fora das escolhidas não entra', () => {
  const lote = [desafio({ difficulty: 'facil' }), desafio({ difficulty: 'dificil', text: 'Diga algo que só existe em laboratório.' })];
  assert.equal(sanitizeGeneratedChallenges(lote, { difficulties: ['facil'] }).length, 1);
});

test('`pool: baixo` não existe no gerado', () => {
  // No banco local existe como exceção consciente ("o desafio é divertido o bastante para
  // compensar"). Esse julgamento é humano; no gerado, poucas respostas é só carta ruim.
  assert.equal(um({ pool: 'baixo' }).length, 0);
  assert.ok(
    CHALLENGES.some((c) => c.pool === 'baixo'),
    'o banco local tem cartas de pool baixo; se deixou de ter, este teste perdeu o sentido',
  );
});

/* ─────────────────────────── duplicatas ─────────────────────────── */

test('não repete o que já existe no banco local', () => {
  const doBanco = CHALLENGES[0];
  assert.equal(um({ text: doBanco.text, category: doBanco.category, difficulty: doBanco.difficulty }).length, 0);
});

test('não repete dentro do próprio lote, nem com pontuação diferente', () => {
  const lote = [desafio(), desafio(), desafio({ text: 'diga  algo que cabe numa mochila .' })];
  assert.equal(sanitizeGeneratedChallenges(lote).length, 1, 'o lote entrou com repetição');
});

/* ─────────────────────── entrada lixo e maldosa ─────────────────────── */

test('entrada que não é lista, ou lista de lixo, devolve lista vazia', () => {
  for (const lixo of [null, undefined, 42, 'texto', {}, { challenges: [] }]) {
    assert.deepEqual(sanitizeGeneratedChallenges(lixo), [], `${JSON.stringify(lixo)} deveria virar lista vazia`);
    assert.deepEqual(sanitizeGeneratedThemes(lixo), []);
  }
  assert.deepEqual(sanitizeGeneratedChallenges([null, 1, 'x', {}, [], { text: 123 }]), []);
});

test('campo com tipo errado não derruba a função, só a carta', () => {
  const lote = [desafio({ text: 123 }), desafio({ category: null }), desafio({ difficulty: {} }), desafio({ text: 'Diga algo que cabe numa gaveta.' })];
  const ok = sanitizeGeneratedChallenges(lote);
  assert.equal(ok.length, 1, 'uma carta boa deveria sobreviver ao lote com lixo');
  assert.equal(ok[0].text, 'Diga algo que cabe numa gaveta.');
});

test('campo a mais na resposta do modelo é ignorado, não copiado', () => {
  const [carta] = sanitizeGeneratedChallenges([desafio({ id: 'ger-001', inventado: true, onPress: 'alert(1)' })]);
  assert.equal(carta.id.startsWith('ia-'), true, 'o id do modelo foi aceito em vez do nosso');
  assert.deepEqual(Object.keys(carta).sort(), ['category', 'difficulty', 'id', 'pool', 'text'] satisfies (keyof BombChallenge)[]);
});

/* ──────────────────────── temas do alfabeto ──────────────────────── */

test('um tema que respeita os critérios passa, pronto para a grade de letras', () => {
  const [t] = umTema();
  assert.ok(t, 'o tema bom foi recusado');
  assert.equal(t.name, 'Coisas de praia');
  assert.equal(t.category, 'Lugares');
  assert.ok(t.letters.length >= ALPHABET_RULES.minLetters);
  assert.ok(isAiGenerated(t.id));
});

test('tema com menos letras que o mínimo trava a roda, então não entra', () => {
  assert.equal(umTema({ letters: 'ABC' }).length, 0);
  const noLimite = 'ABCDEFGHIJLMNO'.slice(0, ALPHABET_RULES.minLetters);
  assert.equal(umTema({ letters: noLimite }).length, 1, `${ALPHABET_RULES.minLetters} letras é o mínimo e deveria passar`);
});

test('as letras saem maiúsculas, em ordem e sem repetir', () => {
  const [t] = umTema({ letters: 'ponmlkjihgfedcbaPONM' });
  assert.ok(t);
  assert.equal(t.letters, 'ABCDEFGHIJKLMNOP');
  assert.equal(new Set(t.letters).size, t.letters.length, 'letra repetida sobrou');
});

test('nome de tema fora dos critérios é recusado', () => {
  for (const name of ['', 'ab', 'Coisas de praia.', 'Um nome absurdamente comprido para um tema', 'Tipos de droga']) {
    assert.equal(umTema({ name }).length, 0, `deveria recusar o nome: "${name}"`);
  }
});

test('emoji inválido não vira caixinha vazia na tela: cai num padrão', () => {
  for (const emoji of ['', 'abc', null, 42, '🏖🏖🏖🏖']) {
    const [t] = umTema({ emoji, name: `Tema ${String(emoji).slice(0, 4)}` });
    assert.ok(t, `o tema foi recusado por causa do emoji: ${String(emoji)}`);
    assert.ok(/\p{Extended_Pictographic}/u.test(t.emoji), `emoji inválido passou: ${t.emoji}`);
  }
});

test('não repete tema que já existe no banco local', () => {
  assert.equal(umTema({ name: THEMES[0].name, category: THEMES[0].category, difficulty: THEMES[0].difficulty }).length, 0);
});

/* ──────────────────────── o pedido que chega pela rede ──────────────────────── */

test('o pedido chega da rede, então vem saneado ou não vem', () => {
  assert.equal(sanitizeContentRequest(null, []), null);
  assert.equal(sanitizeContentRequest({ variant: 'xadrez' }, []), null, 'variante inventada deveria ser recusada');

  const pedido = sanitizeContentRequest(
    { variant: 'classico', categories: ['Comida', 'Inventada', 'Comida'], difficulties: ['facil', 'impossivel'], count: 999, avoidTexts: ['uma', 2, null] },
    ['Comida', 'Games'],
  );
  assert.ok(pedido);
  assert.deepEqual(pedido.categories, ['Comida'], 'categoria inventada ou repetida passou');
  assert.deepEqual(pedido.difficulties, ['facil']);
  assert.equal(pedido.count, MAX_CONTENT_COUNT, 'o teto do lote não foi aplicado');
  assert.deepEqual(pedido.avoidTexts, ['uma'], 'item que não é texto passou');
});

test('pedido sem dificuldade nenhuma vale como "todas", não como "nenhuma"', () => {
  const pedido = sanitizeContentRequest({ variant: 'alfabeto', difficulties: [] }, []);
  assert.deepEqual(pedido?.difficulties, ['facil', 'medio', 'dificil']);
});

test('a lista de "já vistos" tem teto: o prompt não cresce sem limite', () => {
  const muitas = Array.from({ length: 500 }, (_, i) => `Diga a carta ${i}.`);
  const pedido = sanitizeContentRequest({ variant: 'classico', avoidTexts: muitas }, []);
  assert.ok(pedido);
  assert.ok(pedido.avoidTexts.length <= 60, `mandou ${pedido.avoidTexts.length} frases no prompt`);
});

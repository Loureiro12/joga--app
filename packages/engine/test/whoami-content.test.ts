import assert from 'node:assert/strict';
import { test } from 'node:test';

import { IDENTITIES } from '../src/games/whoami-identities';
import {
  MAX_IDENTITY_COUNT,
  WHOAMI_CATEGORIES,
  hasBlockedIdentity,
  hintsOf,
  isAiIdentity,
  matchesIdentity,
  sanitizeGeneratedIdentities,
  sanitizeIdentityRequest,
} from '../src/index';

/**
 * A portaria do conteúdo gerado por IA para o "Quem Sou Eu?".
 *
 * Aqui há uma regra que a portaria da bomba não tinha, e é a mais importante do jogo: **nenhuma
 * dica pode entregar o nome.** Um modelo escorrega nisso — "Dica 2: sou conhecido como o
 * Homem-Aranha" — e o resultado não é uma carta fraca, é a rodada daquele jogador morta, com ele
 * recebendo a resposta justamente quando paga por uma pista.
 *
 * A outra diferença em relação à bomba é a lista de assuntos proibidos, que aqui é MUITO mais
 * curta. Lá se filtrava o assunto da pergunta, então "hospital" era sinal de problema. Aqui
 * "Médico" e "Dentista" são identidades legítimas — herdar a lista da bomba derrubaria as duas.
 */

const base = (over: Record<string, unknown> = {}) => ({
  name: 'Capitão Nascimento',
  emoji: '🎖️',
  category: 'Personagens de filmes',
  difficulty: 'medio',
  kind: 'personagem',
  aliases: ['Nascimento'],
  hints: ['Apareço num filme brasileiro muito citado e comando um grupo especial.', 'Minha frase mais repetida manda alguém pedir para sair.'],
  ...over,
});

const uma = (over?: Record<string, unknown>) => sanitizeGeneratedIdentities([base(over)]);

/* ──────────────────────── o caminho feliz ──────────────────────── */

test('uma identidade que respeita os critérios passa, pronta para o jogo', () => {
  const [i] = uma();
  assert.ok(i, 'a identidade boa foi recusada');
  assert.equal(i.name, 'Capitão Nascimento');
  assert.equal(i.kind, 'personagem');
  assert.deepEqual(i.aliases, ['Nascimento']);
  assert.equal(i.hints.length, 2);
  assert.ok(isAiIdentity(i.id), `id de IA deveria ser reconhecível: ${i.id}`);
});

test('a identidade gerada já serve ao resto do jogo: três dicas e chute por alias', () => {
  // Prova que a portaria não devolve um objeto meio pronto: ele entra no jogo como qualquer
  // identidade do banco.
  const [i] = uma();
  assert.equal(hintsOf(i).length, 3);
  assert.equal(hintsOf(i)[0], 'Sou um personagem fictício.', 'a primeira dica deveria vir do tipo, de graça');
  assert.ok(matchesIdentity('Nascimento', i));
  assert.ok(matchesIdentity('capitao nascimento', i));
});

test('nenhum id gerado colide com o banco local', () => {
  const doBanco = new Set(IDENTITIES.map((i) => i.id));
  for (const i of uma()) assert.ok(!doBanco.has(i.id), `id gerado colidiu com o banco: ${i.id}`);
});

/* ──────────────────────── a regra que mais importa ──────────────────────── */

test('dica que diz o nome é recusada', () => {
  const vazando = [
    ['Sou o Capitão Nascimento, do filme.', 'uma dica com o nome inteiro'],
    ['Meu sobrenome é Nascimento e todos me temem.', 'uma dica com o alias'],
    ['Quem me conhece sabe que nascimento é meu nome.', 'o alias em minúscula'],
  ] as const;
  for (const [dica, porque] of vazando) {
    assert.equal(uma({ hints: [dica, 'Uma segunda dica totalmente inocente e comprida o bastante.'] }).length, 0, `deveria recusar ${porque}: ${dica}`);
  }
});

test('a segunda dica também é conferida, não só a primeira', () => {
  assert.equal(uma({ hints: ['Apareço num filme brasileiro bem citado e comando um grupo.', 'Sou o Nascimento, aquele mesmo do filme.'] }).length, 0);
});

test('palavra comum de um alias composto NÃO é vazamento', () => {
  // O caso real do banco: o nome é "Zelda", o alias é "Princesa Zelda", e uma dica que diz
  // "sou princesa" não entrega nada — "princesa" é palavra comum, não é o nome dela. Contar essas
  // palavras soltas derrubava cinco dicas boas do banco escrito à mão, que é o sinal clássico de
  // régua torta.
  const [i] = sanitizeGeneratedIdentities([
    base({
      name: 'Tiana',
      kind: 'personagem',
      aliases: ['Princesa Tiana'],
      hints: ['Sou princesa num desenho que se passa numa cidade de jazz.', 'Passo boa parte da história transformada em bicho verde.'],
    }),
  ]);
  assert.ok(i, 'a dica foi recusada por uma palavra genérica do alias');

  // Mas a palavra do NOME continua sendo vazamento, venha de onde vier.
  assert.equal(
    sanitizeGeneratedIdentities([
      base({ name: 'Tiana', aliases: [], hints: ['Meu nome é Tiana e eu virei princesa no fim.', 'Passo a história transformada em bicho verde.'] }),
    ]).length,
    0,
  );
});

/* ──────────────────────── forma ──────────────────────── */

test('dica curta, longa ou sem ponto final é recusada', () => {
  const boa = 'Uma segunda dica totalmente inocente e comprida o bastante.';
  for (const ruim of ['Curta.', 'Sem ponto final nenhum nesta frase aqui olha', 'x'.repeat(200) + '.']) {
    assert.equal(uma({ hints: [ruim, boa] }).length, 0, `deveria recusar: ${ruim.slice(0, 40)}`);
  }
});

test('precisa de exatamente duas dicas escritas: a terceira vem do tipo', () => {
  const boa = 'Uma dica totalmente inocente e comprida o bastante para passar.';
  assert.equal(uma({ hints: [] }).length, 0);
  assert.equal(uma({ hints: [boa] }).length, 0);
  assert.equal(uma({ hints: [boa, boa, boa] }).length, 0);
});

test('duas dicas iguais não contam como duas', () => {
  const boa = 'Uma dica totalmente inocente e comprida o bastante para passar.';
  assert.equal(uma({ hints: [boa, boa] }).length, 0);
});

test('nome fora dos limites, com pontuação ou de tipo errado é recusado', () => {
  for (const name of ['', 'x', 'Nome com ponto.', 'Nome, com interrogação?', 'x'.repeat(60), 42, null]) {
    assert.equal(uma({ name }).length, 0, `deveria recusar o nome: ${String(name).slice(0, 30)}`);
  }
});

test('tipo inventado é recusado: é dele que sai a primeira dica', () => {
  assert.equal(uma({ kind: 'coisa' }).length, 0);
  assert.equal(uma({ kind: undefined }).length, 0);
});

test('emoji inválido não vira caixinha vazia na tela: cai num padrão', () => {
  for (const emoji of ['', 'abc', null, 42, '🎖️🎖️🎖️🎖️']) {
    const [i] = uma({ emoji });
    assert.ok(i, `a identidade foi recusada pelo emoji: ${String(emoji)}`);
    assert.ok(i.emoji.length > 0);
  }
});

/* ──────────────────────── categoria, dificuldade, alias ──────────────────────── */

test('categoria fora das escolhidas não entra, mesmo sendo boa', () => {
  const lote = [base({ category: 'Animais', name: 'Tatu-bola', kind: 'animal' }), base({ category: 'Comidas', name: 'Pastel de feira', kind: 'comida' })];
  const so = sanitizeGeneratedIdentities(lote, { categories: ['Animais'] });
  assert.equal(so.length, 1);
  assert.equal(so[0].category, 'Animais');
});

test('categoria que não existe no jogo é recusada', () => {
  assert.equal(uma({ category: 'Fofoca' }).length, 0);
});

test('dificuldade fora das escolhidas não entra', () => {
  const lote = [base({ difficulty: 'facil' }), base({ difficulty: 'dificil', name: 'Outro Nome Qualquer' })];
  assert.equal(sanitizeGeneratedIdentities(lote, { difficulties: ['facil'] }).length, 1);
});

test('alias repetido, igual ao nome, ou em excesso é aparado', () => {
  const [i] = uma({ aliases: ['Nascimento', 'nascimento', 'NASCIMENTO', 'Capitão Nascimento', 'A', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6'] });
  assert.ok(i);
  assert.ok(i.aliases.length <= 6, `${i.aliases.length} aliases passaram`);
  assert.equal(i.aliases.filter((a) => a.toLowerCase() === 'nascimento').length, 1, 'alias repetido passou');
  assert.ok(!i.aliases.some((a) => a.toLowerCase() === 'capitão nascimento'), 'o próprio nome entrou como alias');
});

test('identidade sem alias nenhum é aceita: nome simples não precisa', () => {
  const [i] = uma({ name: 'Jabuticaba', category: 'Comidas', kind: 'comida', aliases: [] });
  assert.ok(i);
  assert.deepEqual(i.aliases, []);
});

/* ──────────────────────── assuntos fora de tom ──────────────────────── */

test('identidade que humilha, sexualiza ou glorifica violência não passa', () => {
  const ruins = ['Hitler', 'Um nazista qualquer', 'O traficante da esquina', 'Uma prostituta', 'O assassino em série', 'O retardado da turma'];
  for (const name of ruins) assert.equal(uma({ name }).length, 0, `deveria recusar: ${name}`);
});

test('dica fora de tom também derruba a identidade', () => {
  assert.equal(uma({ hints: ['Fui morto a tiros numa emboscada muito famosa.', 'Apareço em filme e comando um grupo especial.'] }).length, 0);
});

test('a lista não é a da bomba: profissão de saúde é identidade legítima', () => {
  // Esta é a diferença de propósito entre as duas portarias. A lista da bomba derrubava "Médico"
  // e "Cite algo que se compra na farmácia" — aqui essas coisas são o conteúdo.
  for (const name of ['Médico', 'Dentista', 'Veterinário', 'Enfermeira', 'Psicólogo']) {
    assert.equal(hasBlockedIdentity(name), false, `"${name}" não deveria ser bloqueado`);
  }
  const [i] = uma({ name: 'Enfermeira', category: 'Profissões', kind: 'profissao', aliases: [], hints: ['Trabalho em turnos e passo o dia cuidando de quem está internado.', 'Visto branco e aplico injeção.'] });
  assert.ok(i, 'uma profissão da saúde foi recusada');
});

test('o banco escrito à mão passa inteiro pela lista de recusa', () => {
  // O risco oposto, e mais difícil de notar: uma lista larga não quebra nada, só faz a geração
  // render menos em silêncio. As 168 identidades humanas são a régua.
  const pegas = IDENTITIES.filter((i) => hasBlockedIdentity(i.name) || hintsOf(i).some(hasBlockedIdentity));
  assert.deepEqual(pegas.map((i) => i.name), [], 'a lista de recusa está derrubando conteúdo bom');
});

/* ──────────────────────── duplicatas e lixo ──────────────────────── */

test('não repete o que já existe no banco local', () => {
  const doBanco = IDENTITIES[0];
  assert.equal(uma({ name: doBanco.name, category: doBanco.category, kind: doBanco.kind }).length, 0);
});

test('não repete dentro do próprio lote, nem com acento diferente', () => {
  const lote = [base(), base(), base({ name: 'capitao nascimento' })];
  assert.equal(sanitizeGeneratedIdentities(lote).length, 1, 'o lote entrou com repetição');
});

test('entrada que não é lista, ou lista de lixo, devolve lista vazia', () => {
  for (const lixo of [null, undefined, 42, 'texto', {}, { identities: [] }]) {
    assert.deepEqual(sanitizeGeneratedIdentities(lixo), [], `${JSON.stringify(lixo)} deveria virar lista vazia`);
  }
  assert.deepEqual(sanitizeGeneratedIdentities([null, 1, 'x', {}, [], { name: 123 }]), []);
});

test('campo essencial com tipo errado derruba a identidade; campo acessório, não', () => {
  // A diferença importa. Sem `hints` não há jogo, então a identidade cai. Sem `aliases` o jogo
  // existe — o jogador só precisa escrever o nome certinho —, então ela entra com a lista vazia,
  // igual às dezenas de identidades do banco que legitimamente não têm alias.
  const lote = [base({ hints: 'não é lista' }), base({ aliases: 'nem isto' }), base({ name: 'Zé da Esquina Sortudo' })];
  const ok = sanitizeGeneratedIdentities(lote);
  assert.equal(ok.length, 2, `passaram ${ok.length}: ${ok.map((i) => i.name).join(' · ')}`);
  assert.ok(!ok.some((i) => i.hints.length !== 2), 'entrou identidade sem as duas dicas');
  assert.deepEqual(ok.find((i) => i.name === 'Capitão Nascimento')?.aliases, [], 'o alias malformado deveria virar lista vazia');
});

test('campo a mais na resposta do modelo é ignorado, não copiado', () => {
  const [i] = sanitizeGeneratedIdentities([base({ id: 'batman', imageUrl: 'http://x', onPress: 'alert(1)' })]);
  assert.ok(isAiIdentity(i.id), 'o id do modelo foi aceito em vez do nosso');
  assert.deepEqual(Object.keys(i).sort(), ['aliases', 'category', 'difficulty', 'emoji', 'hints', 'id', 'kind', 'name']);
});

/* ──────────────────────── o pedido que chega pela rede ──────────────────────── */

test('o pedido chega da rede, então vem saneado ou não vem', () => {
  assert.equal(sanitizeIdentityRequest(null), null);
  assert.equal(sanitizeIdentityRequest('texto'), null);

  const p = sanitizeIdentityRequest({
    categories: ['Animais', 'Inventada', 'Animais'],
    difficulties: ['facil', 'impossivel'],
    count: 9_999,
    avoidNames: ['Leão', 42, null],
  });
  assert.ok(p);
  assert.deepEqual(p.categories, ['Animais'], 'categoria inventada ou repetida passou');
  assert.deepEqual(p.difficulties, ['facil']);
  assert.equal(p.count, MAX_IDENTITY_COUNT, 'o teto do lote não foi aplicado');
  assert.deepEqual(p.avoidNames, ['Leão'], 'item que não é texto passou');
});

test('pedido sem dificuldade vale como "todas", não como "nenhuma"', () => {
  assert.deepEqual(sanitizeIdentityRequest({ difficulties: [] })?.difficulties, ['facil', 'medio', 'dificil']);
});

test('pedido sem categoria vale como "todas as categorias"', () => {
  const p = sanitizeIdentityRequest({});
  assert.deepEqual(p?.categories, [], 'lista vazia é o jeito de dizer "qualquer categoria"');
  // E a portaria entende vazio do mesmo jeito.
  assert.equal(sanitizeGeneratedIdentities([base()], { categories: [] }).length, 1);
  assert.ok(WHOAMI_CATEGORIES.length > 0);
});

test('a lista de "já vistos" tem teto: o prompt não cresce sem limite', () => {
  const muitos = Array.from({ length: 500 }, (_, i) => `Identidade ${i}`);
  const p = sanitizeIdentityRequest({ avoidNames: muitos });
  assert.ok(p && p.avoidNames.length <= 80, `mandou ${p?.avoidNames.length} nomes no prompt`);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_LIKELY_SETTINGS,
  LIKELY_CATEGORIES,
  LIKELY_RULES,
  countQuestions,
  eligibleTargets,
  pickLikelyQuestion,
  resolveLikelyRound,
  sanitizeSettings,
  type LikelySettings,
  type Player,
} from '../src/index';
import { QUESTIONS } from '../src/games/likely-questions';

const players: Player[] = ['ana', 'bia', 'caio', 'duda'].map((id, i) => ({
  id,
  name: id.toUpperCase(),
  color: '#7C3AED',
  isHost: i === 0,
  connected: true,
  joinedAt: i,
}));
const ids = players.map((p) => p.id);
const settings = (over: Partial<LikelySettings> = {}): LikelySettings => ({ ...DEFAULT_LIKELY_SETTINGS, ...over });

/* ------------------------------------------------------------------ apuração */

test('o mais votado vence; empate no topo dá dois vencedores, sem desempate', () => {
  const claro = resolveLikelyRound({ ana: 'caio', bia: 'caio', caio: 'ana', duda: 'caio' }, ids, settings());
  assert.deepEqual(claro.winnerIds, ['caio']);
  assert.deepEqual(
    claro.tally.map((t) => [t.playerId, t.votes]),
    [
      ['caio', 3],
      ['ana', 1],
    ],
  );

  const empate = resolveLikelyRound({ ana: 'caio', bia: 'caio', caio: 'ana', duda: 'ana' }, ids, settings());
  assert.deepEqual(empate.winnerIds.sort(), ['ana', 'caio'], 'os dois empatados vencem a pergunta');
  assert.equal(empate.unanimous, false);
});

test('quem não votou simplesmente não conta — nada de voto automático', () => {
  const r = resolveLikelyRound({ ana: 'bia', bia: 'bia' }, ids, settings());
  assert.deepEqual([r.totalVotes, r.eligibleCount], [2, 4]);
  assert.deepEqual(r.winnerIds, ['bia']);
  assert.equal(r.unanimous, false, 'dois votos iguais entre quatro não é o grupo inteiro concordando');
});

test('unanimidade exige todo mundo; se o escolhido votou em si, é auto-unanimidade', () => {
  const semEle = resolveLikelyRound({ ana: 'caio', bia: 'caio', caio: 'ana', duda: 'caio' }, ids, settings());
  assert.equal(semEle.unanimous, false);

  const todos = resolveLikelyRound({ ana: 'caio', bia: 'caio', caio: 'duda', duda: 'caio' }, ids, settings());
  assert.equal(todos.unanimous, false, 'o próprio Caio votou em outro, então não foram todos');

  const unanime = resolveLikelyRound({ ana: 'caio', bia: 'caio', caio: 'caio', duda: 'caio' }, ids, settings());
  assert.deepEqual([unanime.unanimous, unanime.selfConfirmed], [true, true]);

  const semAutoVoto = resolveLikelyRound({ ana: 'bia', bia: 'ana', caio: 'bia', duda: 'bia' }, ids, settings());
  assert.equal(semAutoVoto.unanimous, false, 'a Bia votou na Ana: não é unânime');
});

test('modo secreto não devolve quem votou em quem', () => {
  const votes = { ana: 'caio', bia: 'caio' };
  assert.deepEqual(resolveLikelyRound(votes, ids, settings({ openVotes: true })).tally[0].voterIds, ['ana', 'bia']);
  assert.deepEqual(resolveLikelyRound(votes, ids, settings({ openVotes: false })).tally[0].voterIds, []);
});

/* ------------------------------------------------------------------- pontos */

test('casual não pontua; competitivo paga quem adivinha a maioria, com bônus de unanimidade', () => {
  const votes = { ana: 'caio', bia: 'caio', caio: 'ana', duda: 'caio' };
  assert.deepEqual(resolveLikelyRound(votes, ids, settings()).pointsDelta, {}, 'o modo padrão é sem pontos');

  const { majority, unanimous: bonus } = LIKELY_RULES.points;
  const pago = resolveLikelyRound(votes, ids, settings({ competitive: true })).pointsDelta;
  assert.deepEqual(pago, { ana: majority, bia: majority, caio: 0, duda: majority });

  const unanime = resolveLikelyRound({ ana: 'caio', bia: 'caio', caio: 'caio', duda: 'caio' }, ids, settings({ competitive: true })).pointsDelta;
  assert.deepEqual(unanime, { ana: majority + bonus, bia: majority + bonus, caio: majority + bonus, duda: majority + bonus });

  // Em empate, votar em qualquer um dos empatados vale os pontos.
  const empate = resolveLikelyRound({ ana: 'caio', bia: 'caio', caio: 'ana', duda: 'ana' }, ids, settings({ competitive: true })).pointsDelta;
  assert.deepEqual(empate, { ana: majority, bia: majority, caio: majority, duda: majority });

  // Quem não votou não ganha nada, mas aparece com zero.
  assert.deepEqual(resolveLikelyRound({ ana: 'caio' }, ids, settings({ competitive: true })).pointsDelta, { ana: majority, bia: 0, caio: 0, duda: 0 });
});

/* ------------------------------------------------------------------- alvos */

test('votar em si mesmo é o padrão, e o host pode tirar essa opção', () => {
  assert.deepEqual(eligibleTargets(players, 'ana', settings()), ids);
  assert.deepEqual(eligibleTargets(players, 'ana', settings({ allowSelfVote: false })), ['bia', 'caio', 'duda']);
});

/* --------------------------------------------------------------- perguntas */

test('banco de perguntas: 8 categorias, prefixo fora do texto e nada repetido', () => {
  assert.equal(QUESTIONS.length, 200);
  assert.deepEqual([...new Set(QUESTIONS.map((q) => q.category))].sort(), [...LIKELY_CATEGORIES].sort());

  const ids = QUESTIONS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, 'id repetido');
  const textos = QUESTIONS.map((q) => q.text);
  assert.equal(new Set(textos).size, textos.length, 'pergunta repetida');

  for (const q of QUESTIONS) {
    // A tela já mostra "Quem é mais provável de…": o texto é só a continuação.
    assert.ok(!/quem é mais prov/i.test(q.text), `"${q.text}" repete o prefixo`);
    assert.ok(q.text.endsWith('?'), `"${q.text}" não termina em ?`);
    assert.equal(q.text[0], q.text[0].toLowerCase(), `"${q.text}" começa em maiúscula`);
  }

  // Duas promessas de conteúdo: Família roda com criança na mesa e Trabalho roda com colega.
  assert.ok(
    QUESTIONS.filter((q) => q.category === 'Família').every((q) => q.intensity === 'leve'),
    'Família tem de ser toda leve',
  );
  assert.ok(
    QUESTIONS.filter((q) => q.category === 'Trabalho').every((q) => q.intensity !== 'pesado'),
    'Trabalho não pode ter conteúdo pesado',
  );
});

test('sorteio respeita categoria e intensidade, e não repete na mesma partida', () => {
  const rng = (() => {
    let x = 7;
    return () => (x = (x * 9301 + 49297) % 233280) / 233280;
  })();

  const so = settings({ categories: ['Festa'], intensities: ['leve'] });
  const usadas = new Set<string>();
  for (let i = 0; i < countQuestions(so); i++) {
    const q = pickLikelyQuestion(so, usadas, rng);
    assert.deepEqual([q.category, q.intensity], ['Festa', 'leve']);
    assert.equal(usadas.has(q.id), false, `repetiu "${q.text}"`);
    usadas.add(q.id);
  }
  // Esgotado o baralho, ele reembaralha em vez de travar a partida.
  assert.ok(pickLikelyQuestion(so, usadas, rng).id);

  // Conteúdo pesado é opt-in: sem pedir, nunca aparece.
  const semPesado = settings({ intensities: ['leve', 'moderado'] });
  for (let i = 0; i < 60; i++) assert.notEqual(pickLikelyQuestion(semPesado, new Set(), rng).intensity, 'pesado');
});

test('configuração inválida não deixa a sala sem pergunta', () => {
  const rng = () => 0.5;
  // Categoria que não existe: cai no baralho inteiro em vez de ficar sem rodada.
  assert.ok(pickLikelyQuestion(settings({ categories: ['Inexistente'] }), new Set(), rng).id);
  assert.ok(pickLikelyQuestion(settings({ intensities: [] }), new Set(), rng).id);
});

test('sanitizeSettings descarta lixo e nunca deixa a lista de intensidades vazia', () => {
  const limpo = sanitizeSettings({ categories: ['Festa', 'Inventada'], intensities: [], allowSelfVote: false });
  assert.deepEqual(limpo.categories, ['Festa']);
  assert.deepEqual(limpo.intensities, DEFAULT_LIKELY_SETTINGS.intensities);
  assert.equal(limpo.allowSelfVote, false);
  assert.deepEqual(sanitizeSettings(undefined), DEFAULT_LIKELY_SETTINGS);
});

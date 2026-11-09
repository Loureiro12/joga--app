import assert from 'node:assert/strict';
import { test } from 'node:test';

import { IDENTITIES } from '../src/games/whoami-identities';
import {
  EMPTY_WHOAMI_CONTENT,
  WHOAMI_CATEGORIES,
  WHOAMI_HINTS,
  WHOAMI_POINTS,
  advanceTurn,
  applyPreset,
  closeWhoamiRound,
  countIdentities,
  createWhoamiState,
  currentTurn,
  editDistance,
  firstHint,
  guessIdentity,
  hintLeaksName,
  hintsOf,
  hintsTaken,
  matchesIdentity,
  pickIdentities,
  sanitizeWhoamiSettings,
  someoneSearching,
  startWhoamiRound,
  takeHint,
  whoamiRoundPoints,
  whoamiStandings,
  whoamiTitles,
  type Identity,
  type WhoamiState,
} from '../src/index';

/**
 * Quem Sou Eu?: as regras puras.
 *
 * O que este arquivo protege, em ordem de gravidade:
 *
 * 1. **O chute.** É o momento do jogo, e o único em que o app pode estragar tudo sendo rígido:
 *    recusar "Bob esponga" numa festa transforma a melhor hora da rodada numa discussão.
 * 2. **As dicas.** Nenhuma pode entregar o nome, e o jogador não pode ver a que não pagou.
 * 3. **A pontuação.** Dica barateia, erro custa, primeiro leva bônus — e os três se compõem.
 * 4. **O turno.** Ele não pode travar: nem quando alguém descobre, nem quando alguém sai.
 */

const seeded = (seed: number) => {
  let x = seed;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
};

const TRES = ['ana', 'bia', 'caio'];
const T0 = 1_000_000;

function rodada(jogadores = TRES, settings = {}, seed = 7, now = T0): WhoamiState {
  const s = createWhoamiState(sanitizeWhoamiSettings(settings));
  startWhoamiRound(s, jogadores, now, seeded(seed));
  return s;
}

/** O nome que o jogador precisa descobrir. Nos testes é lícito espiar; no jogo, não. */
const nomeDe = (s: WhoamiState, id: string) => s.assigned[id].name;

/* ──────────────────────────── o banco ──────────────────────────── */

test('o banco tem 168 identidades, 12 por categoria, e ids únicos', () => {
  assert.equal(IDENTITIES.length, 168);
  assert.deepEqual([...new Set(IDENTITIES.map((i) => i.category))].sort(), [...WHOAMI_CATEGORIES].sort());
  for (const c of WHOAMI_CATEGORIES) assert.equal(IDENTITIES.filter((i) => i.category === c).length, 12, `${c} não tem 12`);
  assert.equal(new Set(IDENTITIES.map((i) => i.id)).size, IDENTITIES.length, 'id repetido no banco');
});

test('toda categoria tem identidade difícil suficiente para o Hardcore existir', () => {
  // O Hardcore joga só com `dificil`. Sem três por categoria, marcar uma categoria no Hardcore
  // deixaria uma mesa de oito pessoas sem identidade para todo mundo.
  for (const c of WHOAMI_CATEGORIES) {
    const dificeis = IDENTITIES.filter((i) => i.category === c && i.difficulty === 'dificil').length;
    assert.ok(dificeis >= 3, `${c} tem só ${dificeis} identidade(s) difícil(eis)`);
  }
});

test('nenhuma dica do banco entrega o nome, pela MESMA régua que vale para a IA', () => {
  // A regra mais importante do jogo. Uma dica que diz o nome não é dica fraca: é a rodada daquele
  // jogador morta, e ele nem fica sabendo por quê.
  //
  // Usa `hintLeaksName`, a função da portaria, e não uma cópia da lógica aqui. Com isso o teste
  // faz duas coisas de uma vez: prova que as 168 identidades humanas estão limpas, e prova que a
  // régua aplicada ao conteúdo gerado não é mais apertada que o banco que ela deveria imitar.
  const vazam = IDENTITIES.flatMap((i) =>
    hintsOf(i)
      .filter((dica) => hintLeaksName(dica, i.name, i.aliases))
      .map((dica) => `${i.name}: ${dica}`),
  );
  assert.deepEqual(vazam, [], `dicas que entregam o nome:\n${vazam.join('\n')}`);
});

test('a primeira dica é derivada do tipo, e é a mesma para todo mundo do mesmo tipo', () => {
  // É a dica que não custa geração nenhuma (§29). Vale um teste porque é ela que garante tom
  // idêntico nas 168 identidades e em toda identidade que a IA gerar depois.
  const porTipo = new Map<string, Set<string>>();
  for (const i of IDENTITIES) {
    if (!porTipo.has(i.kind)) porTipo.set(i.kind, new Set());
    porTipo.get(i.kind)!.add(firstHint(i));
  }
  for (const [kind, frases] of porTipo) assert.equal(frases.size, 1, `${kind} tem ${frases.size} primeiras dicas diferentes`);
  assert.equal(firstHint(IDENTITIES.find((i) => i.kind === 'personagem')!), 'Sou um personagem fictício.');
});

test('cada identidade tem exatamente três dicas, da mais vaga para a mais entregadora', () => {
  for (const i of IDENTITIES) {
    assert.equal(hintsOf(i).length, WHOAMI_HINTS, `${i.name} não tem ${WHOAMI_HINTS} dicas`);
    assert.ok(hintsOf(i).every((d) => d.endsWith('.')), `${i.name} tem dica sem ponto final`);
  }
});

/* ──────────────────────────── o chute ──────────────────────────── */

test('o chute exato acerta', () => {
  const aranha = IDENTITIES.find((i) => i.name === 'Homem-Aranha')!;
  assert.ok(matchesIdentity('Homem-Aranha', aranha));
});

test('o chute acerta por alias: é para isso que eles existem', () => {
  const aranha = IDENTITIES.find((i) => i.name === 'Homem-Aranha')!;
  for (const chute of ['Spider-Man', 'spiderman', 'Peter Parker', 'aranha']) {
    assert.ok(matchesIdentity(chute, aranha), `"${chute}" deveria acertar`);
  }
});

test('o chute perdoa acento, caixa e pontuação', () => {
  const beyonce = IDENTITIES.find((i) => i.name === 'Beyoncé')!;
  for (const chute of ['beyonce', 'BEYONCÉ', 'Beyoncé!', '  beyonce  ']) {
    assert.ok(matchesIdentity(chute, beyonce), `"${chute}" deveria acertar`);
  }
});

test('o chute perdoa erro de digitação em nome comprido', () => {
  // Numa festa, recusar quem escreveu quase certo transforma o melhor momento do jogo em briga.
  const esponja = IDENTITIES.find((i) => i.name === 'Bob Esponja')!;
  assert.ok(matchesIdentity('Bob esponga', esponja), 'erro de uma letra deveria passar');
  const cristiano = IDENTITIES.find((i) => i.name === 'Cristiano Ronaldo')!;
  assert.ok(matchesIdentity('cristiano ronaldo', cristiano));
  assert.ok(matchesIdentity('Cristiano Ronaldo', cristiano));
});

test('nome curto não ganha folga: a generosidade pararia de ser justa', () => {
  // Com duas letras perdoadas num nome de três, "Bob" aceitaria "Tom".
  const tom = IDENTITIES.find((i) => i.name === 'Tom')!;
  assert.ok(matchesIdentity('Tom', tom));
  assert.ok(!matchesIdentity('Bob', tom), '"Bob" não pode acertar "Tom"');
  assert.ok(!matchesIdentity('Som', tom));
});

test('chute errado é errado, mesmo sendo de outra identidade do jogo', () => {
  const batman = IDENTITIES.find((i) => i.name === 'Batman')!;
  for (const chute of ['Shrek', 'Homem-Aranha', 'Batgirl', 'x', '']) {
    assert.ok(!matchesIdentity(chute, batman), `"${chute}" não deveria acertar Batman`);
  }
});

test('a distância de edição tem teto e não explode em texto grande', () => {
  assert.equal(editDistance('abc', 'abc', 2), 0);
  assert.equal(editDistance('abc', 'abd', 2), 1);
  assert.ok(editDistance('a'.repeat(400), 'b'.repeat(400), 2) > 2);
});

/* ──────────────────────────── distribuição ──────────────────────────── */

test('todo mundo recebe uma identidade, e todas diferentes', () => {
  const s = rodada(['ana', 'bia', 'caio', 'duda', 'edu']);
  const ids = Object.values(s.assigned).map((i) => i.id);
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5, 'duas pessoas receberam a mesma identidade');
});

test('as identidades respeitam a categoria e a dificuldade escolhidas', () => {
  const s = rodada(TRES, { categories: ['Animais'], difficulties: ['facil'] });
  for (const i of Object.values(s.assigned)) {
    assert.equal(i.category, 'Animais');
    assert.equal(i.difficulty, 'facil');
  }
});

test('configuração apertada demais abre o baralho em vez de deixar alguém sem identidade', () => {
  // Uma categoria com 3 difíceis contra 5 jogadores: melhor fugir do filtro do que travar.
  const s = rodada(['ana', 'bia', 'caio', 'duda', 'edu'], { categories: ['Animais'], difficulties: ['dificil'] });
  const ids = Object.values(s.assigned).map((i) => i.id);
  assert.equal(new Set(ids).size, 5, 'repetiu identidade por causa do filtro');
});

test('nenhuma identidade se repete entre as rodadas da mesma partida', () => {
  // Sem filtro de categoria: 4 rodadas × 3 pessoas pedem 12 identidades, e uma categoria só tem 9
  // na dificuldade padrão — o que o teste quer provar é a ausência de repetição, não o esgotamento.
  const s = createWhoamiState(sanitizeWhoamiSettings({}));
  const vistas: string[] = [];
  for (let r = 0; r < 4; r++) {
    startWhoamiRound(s, TRES, T0 + r * 1000, seeded(5 + r));
    vistas.push(...Object.values(s.assigned).map((i) => i.id));
  }
  assert.equal(new Set(vistas).size, vistas.length, `repetiu entre rodadas: ${vistas.join(' · ')}`);
});

test('quando o baralho da configuração esgota, a rodada acontece mesmo repetindo', () => {
  // Nove identidades elegíveis contra doze pedidas: repetir é o certo. Rodada sem identidade não
  // existe, e o terceiro nível de recuo é justamente este.
  const s = createWhoamiState(sanitizeWhoamiSettings({ categories: ['Comidas'] }));
  for (let r = 0; r < 4; r++) {
    startWhoamiRound(s, TRES, T0 + r * 1000, seeded(5 + r));
    assert.equal(Object.keys(s.assigned).length, 3, `a rodada ${r + 1} deixou alguém sem identidade`);
    assert.equal(new Set(Object.values(s.assigned).map((i) => i.id)).size, 3, `a rodada ${r + 1} repetiu dentro dela mesma`);
  }
});

test('o que o grupo já viu em outras partidas é evitado enquanto houver inédito', () => {
  const comida = IDENTITIES.filter((i) => i.category === 'Comidas');
  const vistos = comida.slice(0, 6).map((i) => i.id);
  const content = { ...EMPTY_WHOAMI_CONTENT, seenIds: vistos };

  for (let seed = 1; seed <= 20; seed++) {
    const escolhidas = pickIdentities(sanitizeWhoamiSettings({ categories: ['Comidas'] }), 3, new Set(), seeded(seed), content);
    for (const i of escolhidas) assert.ok(!vistos.includes(i.id), `saiu identidade já vista (seed ${seed}): ${i.name}`);
  }
});

test('o contador da tela soma banco e geradas', () => {
  const settings = sanitizeWhoamiSettings({ categories: ['Animais'] });
  const soBanco = countIdentities(settings);
  const gerada: Identity = { id: 'ia-tatu', name: 'Tatu', emoji: '🦔', category: 'Animais', difficulty: 'facil', kind: 'animal', aliases: [], hints: ['x.', 'y.'] };
  assert.equal(countIdentities(settings, { identities: [gerada], seenIds: [] }), soBanco + 1);
});

/* ──────────────────────────── dicas ──────────────────────────── */

test('a dica sai na ordem e o jogador só vê o que pediu', () => {
  const s = rodada();
  assert.deepEqual(hintsTaken(s, 'ana'), [], 'sem pedir, não deveria haver dica nenhuma');

  const primeira = takeHint(s, 'ana');
  assert.equal(primeira, firstHint(s.assigned.ana));
  assert.deepEqual(hintsTaken(s, 'ana'), [primeira]);

  const segunda = takeHint(s, 'ana');
  assert.equal(segunda, s.assigned.ana.hints[0]);
  assert.equal(hintsTaken(s, 'ana').length, 2);
});

test('as dicas acabam, e pedir além disso não é permitido', () => {
  const s = rodada();
  for (let i = 0; i < WHOAMI_HINTS; i++) assert.ok(takeHint(s, 'ana'), `a dica ${i + 1} deveria sair`);
  assert.equal(takeHint(s, 'ana'), null, 'saiu uma quarta dica');
  assert.equal(s.round.ana.hintsUsed, WHOAMI_HINTS);
});

test('com dicas desligadas (Hardcore), ninguém pede dica', () => {
  const s = rodada(TRES, { hints: false });
  assert.equal(takeHint(s, 'ana'), null);
  assert.equal(s.round.ana.hintsUsed, 0, 'contou dica num jogo sem dica');
});

test('quem já descobriu não pede mais dica', () => {
  const s = rodada();
  const daVez = currentTurn(s)!;
  guessIdentity(s, daVez, nomeDe(s, daVez), T0 + 1000);
  assert.equal(takeHint(s, daVez), null);
});

/* ──────────────────────────── pontuação ──────────────────────────── */

test('acertar sem dica vale cheio, e o primeiro ganha bônus', () => {
  const s = rodada();
  const daVez = currentTurn(s)!;
  const { correct } = guessIdentity(s, daVez, nomeDe(s, daVez), T0 + 1000);
  assert.ok(correct);
  assert.equal(whoamiRoundPoints(s, daVez), WHOAMI_POINTS.found[0] + WHOAMI_POINTS.firstBonus);
});

test('cada dica barateia o acerto', () => {
  for (const dicas of [0, 1, 2, 3]) {
    const s = rodada();
    const daVez = currentTurn(s)!;
    for (let i = 0; i < dicas; i++) takeHint(s, daVez);
    guessIdentity(s, daVez, nomeDe(s, daVez), T0 + 1000);
    assert.equal(whoamiRoundPoints(s, daVez), WHOAMI_POINTS.found[dicas] + WHOAMI_POINTS.firstBonus, `com ${dicas} dica(s)`);
  }
});

test('chute errado custa, e custa mesmo de quem acerta depois', () => {
  const s = rodada();
  const a = currentTurn(s)!;
  guessIdentity(s, a, 'com certeza não é isso', T0 + 1000);
  assert.equal(s.round[a].misses, 1);
  assert.equal(whoamiRoundPoints(s, a), WHOAMI_POINTS.wrongAttempt);

  // Volta a vez para ele e agora acerta: o erro continua descontado.
  while (currentTurn(s) !== a) advanceTurn(s, T0 + 2000);
  guessIdentity(s, a, nomeDe(s, a), T0 + 3000);
  assert.equal(whoamiRoundPoints(s, a), WHOAMI_POINTS.found[0] + WHOAMI_POINTS.firstBonus + WHOAMI_POINTS.wrongAttempt);
});

test('quem não descobre fica com zero, ou negativo se chutou à toa', () => {
  const s = rodada();
  assert.equal(whoamiRoundPoints(s, 'ana'), 0);
  const a = currentTurn(s)!;
  guessIdentity(s, a, 'chute 1', T0 + 1000);
  while (currentTurn(s) !== a) advanceTurn(s, T0 + 2000);
  guessIdentity(s, a, 'chute 2', T0 + 3000);
  assert.equal(whoamiRoundPoints(s, a), 2 * WHOAMI_POINTS.wrongAttempt);
});

test('o bônus de velocidade é de um só', () => {
  const s = rodada();
  const ordem = [...s.order];
  guessIdentity(s, ordem[0], nomeDe(s, ordem[0]), T0 + 1000);
  while (currentTurn(s) !== ordem[1]) advanceTurn(s, T0 + 1500);
  guessIdentity(s, ordem[1], nomeDe(s, ordem[1]), T0 + 2000);

  assert.equal(whoamiRoundPoints(s, ordem[0]), WHOAMI_POINTS.found[0] + WHOAMI_POINTS.firstBonus);
  assert.equal(whoamiRoundPoints(s, ordem[1]), WHOAMI_POINTS.found[0], 'o segundo levou bônus de velocidade');
});

/* ──────────────────────────── o turno ──────────────────────────── */

test('o chute passa a vez, acerte ou erre: é uma tentativa por turno', () => {
  const s = rodada();
  const a = currentTurn(s)!;
  guessIdentity(s, a, 'chute errado', T0 + 1000);
  assert.notEqual(currentTurn(s), a, 'a vez ficou com quem acabou de chutar');
});

test('a vez pula quem já descobriu, mas a pessoa continua na sala', () => {
  const s = rodada();
  const a = currentTurn(s)!;
  guessIdentity(s, a, nomeDe(s, a), T0 + 1000);

  // Duas voltas inteiras: a vez nunca volta para quem já achou.
  for (let i = 0; i < 6; i++) {
    assert.notEqual(currentTurn(s), a, 'a vez voltou para quem já descobriu');
    advanceTurn(s, T0 + 2000 + i);
  }
  // E ele continua com identidade e pontos — só não recebe turno.
  assert.ok(s.assigned[a]);
  assert.ok(whoamiRoundPoints(s, a) > 0);
});

test('quando o último descobre, a rodada não tem mais a quem passar', () => {
  const s = rodada();
  for (const id of [...s.order]) {
    while (currentTurn(s) !== id && someoneSearching(s)) advanceTurn(s, T0 + 1000);
    guessIdentity(s, id, nomeDe(s, id), T0 + 2000);
  }
  assert.equal(someoneSearching(s), false);
  assert.equal(advanceTurn(s, T0 + 3000), false, 'ainda havia vez para passar numa rodada acabada');
});

test('o prazo do turno só existe quando o grupo pediu limite', () => {
  assert.equal(rodada(TRES, { turnSeconds: 0 }).turnEndsAt, null);
  assert.equal(rodada(TRES, { turnSeconds: 30 }).turnEndsAt, T0 + 30_000);
  assert.equal(rodada(TRES, { roundMinutes: 0 }).roundEndsAt, null);
  assert.equal(rodada(TRES, { roundMinutes: 10 }).roundEndsAt, T0 + 600_000);
});

/* ──────────────────────────── fechar a rodada ──────────────────────────── */

test('a revelação mostra a identidade de todos, e soma no acumulado', () => {
  const s = rodada();
  const a = currentTurn(s)!;
  guessIdentity(s, a, nomeDe(s, a), T0 + 1000);
  const reveal = closeWhoamiRound(s);

  assert.equal(reveal.length, 3);
  assert.ok(reveal.every((r) => r.identity.name.length > 0), 'a revelação veio sem nome');
  assert.equal(reveal.filter((r) => r.found).length, 1);
  assert.equal(s.totals[a].found, 1);
  assert.equal(s.totals[a].firsts, 1);
});

test('fechar a rodada duas vezes não dobra a pontuação', () => {
  // Importa porque o fim pode chegar por três caminhos ao mesmo tempo: o último acerto, o prazo
  // da rodada e o host encerrando.
  const s = rodada();
  const a = currentTurn(s)!;
  guessIdentity(s, a, nomeDe(s, a), T0 + 1000);
  closeWhoamiRound(s);
  const pontos = s.totals[a].points;
  closeWhoamiRound(s);
  assert.equal(s.totals[a].points, pontos);
});

test('os prazos somem quando a rodada fecha', () => {
  const s = rodada(TRES, { turnSeconds: 30, roundMinutes: 5 });
  closeWhoamiRound(s);
  assert.equal(s.turnEndsAt, null);
  assert.equal(s.roundEndsAt, null);
});

/* ──────────────────────────── placar e títulos ──────────────────────────── */

test('o placar ordena por pontos e empate divide a posição', () => {
  const s = rodada();
  for (const id of [...s.order]) {
    while (currentTurn(s) !== id && someoneSearching(s)) advanceTurn(s, T0 + 1000);
    guessIdentity(s, id, nomeDe(s, id), T0 + 2000);
  }
  closeWhoamiRound(s);
  const placar = whoamiStandings(s);
  assert.equal(placar.length, 3);
  assert.equal(placar[0].position, 1);
  // Os dois últimos acertaram sem dica e sem erro: mesma pontuação, mesma posição.
  assert.equal(placar[1].points, placar[2].points);
  assert.equal(placar[1].position, placar[2].position);
});

test('os títulos premiam o que o app realmente sabe medir', () => {
  const s = rodada();
  const ordem = [...s.order];
  // O primeiro acerta de primeira; o segundo erra duas vezes antes de achar.
  guessIdentity(s, ordem[0], nomeDe(s, ordem[0]), T0 + 1000);
  for (let i = 0; i < 2; i++) {
    while (currentTurn(s) !== ordem[1]) advanceTurn(s, T0 + 1500);
    guessIdentity(s, ordem[1], 'chute errado', T0 + 2000);
  }
  while (currentTurn(s) !== ordem[1]) advanceTurn(s, T0 + 2500);
  takeHint(s, ordem[1]);
  guessIdentity(s, ordem[1], nomeDe(s, ordem[1]), T0 + 3000);
  closeWhoamiRound(s);

  const titulos = whoamiTitles(s);
  const por = (key: string) => titulos.find((t) => t.key === key);
  assert.equal(por('mestre')?.playerId, ordem[0]);
  // "Detetive" mede quem achou sem pedir dica — as perguntas são faladas, o app não as vê.
  assert.equal(por('detetive')?.playerId, ordem[0]);
  assert.equal(por('chutador')?.playerId, ordem[1]);
});

test('partida sem ninguém pontuando não inventa título', () => {
  const s = createWhoamiState(sanitizeWhoamiSettings({}));
  assert.deepEqual(whoamiTitles(s), []);
});

/* ──────────────────────────── opções ──────────────────────────── */

test('as opções chegam da rede, então vêm saneadas ou não vêm', () => {
  const s = sanitizeWhoamiSettings({ categories: ['Animais', 'Inventada'], difficulties: ['facil', 'impossivel'] as never, turnSeconds: 999, roundMinutes: 77, hints: true });
  assert.deepEqual(s.categories, ['Animais']);
  assert.deepEqual(s.difficulties, ['facil']);
  assert.equal(s.turnSeconds, 45, 'aceitou um tempo de turno que não existe na tela');
  assert.equal(s.roundMinutes, 10);
});

test('sem dificuldade nenhuma vale o padrão, não "nenhuma identidade"', () => {
  assert.deepEqual(sanitizeWhoamiSettings({ difficulties: [] }).difficulties, ['facil', 'medio']);
});

test('os presets são combinações de opções, não motores diferentes', () => {
  const hardcore = applyPreset('hardcore', ['Animais']);
  assert.deepEqual(hardcore.difficulties, ['dificil']);
  assert.equal(hardcore.hints, false);
  assert.deepEqual(hardcore.categories, ['Animais']);

  const rapido = applyPreset('rapido', []);
  assert.equal(rapido.turnSeconds, 20);
  assert.equal(rapido.hints, false);
  assert.equal(applyPreset('classico', []).hints, true);
});

test('o estado é JSON puro: a sala o grava e restaura em outro processo', () => {
  const s = rodada();
  takeHint(s, 'ana');
  closeWhoamiRound(s);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

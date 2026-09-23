import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHALLENGES } from '../src/games/bomb-challenges';
import {
  BOMB_CATEGORIES,
  BOMB_RULES,
  DEFAULT_BOMB_SETTINGS,
  armBomb,
  bombTick,
  countChallenges,
  createBombMatch,
  drawFuse,
  endMatch,
  highlights,
  isOver,
  nextRound,
  passBomb,
  sanitizeBombSettings,
  standings,
  type BombPlayer,
  type BombSettings,
  type BombState,
} from '../src/index';

const players: BombPlayer[] = ['ana', 'bia', 'caio', 'duda'].map((id) => ({ id, name: id.toUpperCase(), color: '#EF4444' }));
const T0 = 1_000_000;
const settings = (over: Partial<BombSettings> = {}): Partial<BombSettings> => over;

/** Gerador determinístico: mesma semente, mesma partida. */
const seeded = (seed: number) => {
  let x = seed;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
};
/** Sempre o mesmo valor: deixa o sorteio previsível quando o teste precisa saber o pavio. */
const fixo = (v: number) => () => v;

function match(over: Partial<BombSettings> = {}, rng = seeded(7)) {
  return createBombMatch(players, { ...over }, T0, rng);
}

/* --------------------------------------------------------------------- pavio */

test('o pavio respeita a faixa, nunca fura o piso de segurança e pende para o fim', () => {
  const s = { ...DEFAULT_BOMB_SETTINGS, minSeconds: 20, maxSeconds: 60 };
  const amostras = Array.from({ length: 200 }, (_, i) => drawFuse(s, fixo((i + 0.5) / 200)) / 1000);
  assert.ok(Math.min(...amostras) >= 20, 'estourou o piso da faixa');
  assert.ok(Math.max(...amostras) <= 60, 'passou do teto da faixa');

  // A distribuição é enviesada de propósito: explosão muito precoce tem de ser rara (§15).
  const mediana = [...amostras].sort((a, b) => a - b)[100];
  assert.ok(mediana > 40, `a mediana deveria passar do meio da faixa, veio ${mediana.toFixed(1)}s`);
  assert.ok(amostras.filter((t) => t < 25).length / amostras.length < 0.15, 'explosões precoces demais');

  // Faixa curta: o piso de segurança ainda vale.
  const curta = drawFuse({ ...s, minSeconds: 1, maxSeconds: 2 }, fixo(0.01)) / 1000;
  assert.equal(curta, BOMB_RULES.safetySeconds);
});

/* -------------------------------------------------------------------- rodada */

test('fluxo: passe o celular → acende → passa sem reiniciar → explode com quem está segurando', () => {
  const state = match({}, seeded(3));
  assert.equal(state.phase, 'handoff');
  assert.ok(state.challenge!.text.length > 0);
  assert.equal(state.explodeAt, null, 'no handoff a bomba ainda está apagada');

  const armed = armBomb(state, T0, fixo(0.5));
  assert.equal(armed.phase, 'armed');
  const explodeAt = armed.explodeAt!;
  assert.ok(explodeAt > T0);

  // Passar NÃO reinicia o pavio (§18): o instante da explosão é o mesmo.
  const passou = passBomb(armed, T0 + 5_000);
  assert.equal(passou.explodeAt, explodeAt);
  assert.notEqual(passou.activeId, armed.activeId);
  assert.equal(passou.passes[armed.activeId], 1);
  assert.equal(passou.heldMs[armed.activeId], 5_000);

  // Nada acontece antes da hora.
  assert.equal(bombTick(passou, explodeAt - 1).phase, 'armed');

  const boom = bombTick(passou, explodeAt);
  assert.equal(boom.phase, 'exploded');
  assert.equal(boom.loserId, passou.activeId, 'perde quem está com ela no toque, não quem passou');
  assert.equal(boom.bombs[passou.activeId], 1);
  assert.equal(boom.explodeAt, null);
  assert.deepEqual(boom.history, [{ round: 1, challengeId: state.challenge!.id, challenge: state.challenge!.text, loserId: passou.activeId }]);
});

test('o app em segundo plano não segura a bomba: ela estoura no primeiro tick de volta', () => {
  const armed = armBomb(match(), T0, fixo(0.5));
  // Ninguém tocou em nada por dois minutos; ao voltar, já era.
  const voltou = bombTick(armed, T0 + 120_000);
  assert.equal(voltou.phase, 'exploded');
  assert.equal(voltou.loserId, armed.activeId);
});

test('depois da explosão, passar e acender não fazem mais nada', () => {
  const armed = armBomb(match(), T0, fixo(0.5));
  const boom = bombTick(armed, armed.explodeAt!);
  assert.equal(passBomb(boom, T0 + 1), boom, 'o botão de passar já está bloqueado');
  assert.equal(armBomb(boom, T0 + 1), boom);
  assert.equal(bombTick(boom, T0 + 99_999), boom);
});

/* ---------------------------------------------------------------- passagens */

test('ordem circular segue a lista; no caos ninguém recebe de si mesmo', () => {
  let state = armBomb(match({ order: 'circular' }, seeded(11)), T0, fixo(0.9));
  const ordem = [state.activeId];
  for (let i = 0; i < 5; i++) {
    state = passBomb(state, T0 + i * 100);
    ordem.push(state.activeId);
  }
  const ids = players.map((p) => p.id);
  for (let i = 1; i < ordem.length; i++) {
    const esperado = ids[(ids.indexOf(ordem[i - 1]) + 1) % ids.length];
    assert.equal(ordem[i], esperado, 'a ordem circular saiu do lugar');
  }

  const rng = seeded(5);
  let caos = armBomb(match({ order: 'caos' }, rng), T0, fixo(0.9));
  for (let i = 0; i < 30; i++) {
    const antes = caos.activeId;
    caos = passBomb(caos, T0 + i * 100, rng);
    assert.notEqual(caos.activeId, antes, 'ninguém pode receber a bomba de si mesmo');
  }
});

/* ------------------------------------------------------------- modos e fim */

test('casual: conta bombas, não elimina, e a partida acaba nas rodadas combinadas', () => {
  let state = match({ mode: 'casual', totalRounds: 3 }, seeded(2));
  for (let r = 1; r <= 3; r++) {
    assert.equal(state.roundIndex, r);
    state = armBomb(state, T0, fixo(0.5));
    state = bombTick(state, state.explodeAt!);
    assert.equal(state.phase, 'exploded');
    assert.deepEqual(state.eliminated, [], 'casual não elimina ninguém');
    state = nextRound(state, seeded(r));
  }
  assert.equal(state.phase, 'finished');

  const total = Object.values(state.bombs).reduce((a, b) => a + b, 0);
  assert.equal(total, 3, 'uma bomba por rodada');
  const tabela = standings(state);
  assert.equal(tabela[0].position, 1);
  assert.ok(tabela[0].bombs <= tabela[tabela.length - 1].bombs, 'menos bombas é melhor');
});

test('eliminação: cada explosão tira uma vida, quem zera sai da ordem e sobra um', () => {
  // rng que sempre devolve o mesmo perdedor no handoff seguinte não serve: o perdedor começa.
  let state = match({ mode: 'eliminacao', lives: 2, totalRounds: 0, startsNext: 'perdedor' }, seeded(9));
  const vitimas: string[] = [];

  for (let guard = 0; guard < 30 && state.phase !== 'finished'; guard++) {
    state = armBomb(state, T0, fixo(0.5));
    state = bombTick(state, state.explodeAt!);
    vitimas.push(state.loserId!);
    state = nextRound(state, seeded(guard + 1));
  }

  assert.equal(state.phase, 'finished');
  assert.equal(state.eliminated.length, players.length - 1, 'sobra exatamente uma pessoa');
  const sobrevivente = players.find((p) => !state.eliminated.includes(p.id))!;
  assert.equal(state.lives[sobrevivente.id] > 0, true);
  // Quem foi eliminado parou de receber a bomba.
  for (const id of state.eliminated) assert.ok(state.bombs[id] >= 2, 'só sai quem zerou as duas vidas');
  assert.equal(standings(state)[0].playerId, sobrevivente.id, 'o sobrevivente lidera');
});

test('pontos: passagem vale por quem passou, sobreviver vale para os outros', () => {
  const { pass, survive } = BOMB_RULES.points;
  let state = armBomb(match({ mode: 'pontos', totalRounds: 1 }, seeded(4)), T0, fixo(0.9));
  const primeiro = state.activeId;
  state = passBomb(state, T0 + 1_000);
  const segundo = state.activeId;
  assert.equal(state.points[primeiro], pass);

  state = bombTick(state, state.explodeAt!);
  assert.equal(state.loserId, segundo);
  assert.equal(state.points[segundo], 0, 'quem segurou na explosão não ganha o bônus');
  assert.equal(state.points[primeiro], pass + survive);
  assert.equal(standings(state)[0].playerId, primeiro, 'no modo pontos, mais pontos lidera');
});

test('quem perdeu começa a próxima; no sorteio, não', () => {
  let state = armBomb(match({ startsNext: 'perdedor' }, seeded(6)), T0, fixo(0.5));
  state = passBomb(state, T0 + 500);
  state = bombTick(state, state.explodeAt!);
  const perdedor = state.loserId!;
  const proxima = nextRound(state, seeded(1));
  assert.equal(proxima.activeId, perdedor);
  assert.equal(proxima.phase, 'handoff');
  assert.equal(proxima.loserId, null);
  assert.notEqual(proxima.challenge!.id, state.challenge!.id, 'desafio novo a cada rodada');

  const sorteado = nextRound({ ...state, settings: { ...state.settings, startsNext: 'sorteio' } }, seeded(123));
  assert.ok(players.some((p) => p.id === sorteado.activeId));
});

test('partida sem limite só acaba quando o grupo manda', () => {
  let state = match({ totalRounds: 0, mode: 'casual' }, seeded(8));
  for (let i = 0; i < 4; i++) {
    state = armBomb(state, T0, fixo(0.5));
    state = bombTick(state, state.explodeAt!);
    assert.equal(isOver(state), false);
    state = nextRound(state, seeded(i));
    assert.equal(state.phase, 'handoff');
  }
  assert.equal(endMatch(state).phase, 'finished');
});

/* ---------------------------------------------------------------- conteúdo */

test('banco de desafios: 10 categorias, nada repetido e respostas de sobra', () => {
  assert.equal(CHALLENGES.length, 180);
  assert.deepEqual([...new Set(CHALLENGES.map((c) => c.category))].sort(), [...BOMB_CATEGORIES].sort());

  const ids = CHALLENGES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'id repetido');
  const textos = CHALLENGES.map((c) => c.text);
  assert.equal(new Set(textos).size, textos.length, 'desafio repetido');

  for (const c of CHALLENGES) {
    assert.ok(c.text.endsWith('.'), `"${c.text}" não termina em ponto`);
    assert.equal(c.text[0], c.text[0].toUpperCase(), `"${c.text}" não começa em maiúscula`);
  }

  // Num grupo de 8, um desafio de poucas respostas acaba antes da bomba (§40).
  for (const categoria of BOMB_CATEGORIES) {
    const daCategoria = CHALLENGES.filter((c) => c.category === categoria);
    assert.equal(daCategoria.length, 18, `${categoria} tem ${daCategoria.length}`);
    assert.ok(daCategoria.filter((c) => c.pool === 'alto').length >= 12, `${categoria} tem poucos desafios de resposta farta`);
    assert.ok(daCategoria.filter((c) => c.pool === 'baixo').length <= 2, `${categoria} tem desafios curtos demais`);
  }
});

test('desafio não se repete na partida, e o baralho reembaralha em vez de travar', () => {
  const so = { ...DEFAULT_BOMB_SETTINGS, categories: ['Caos'], difficulties: ['facil' as const] };
  const total = countChallenges(so);
  assert.ok(total > 0);

  const rng = seeded(21);
  let state = createBombMatch(players, so, T0, rng);
  const vistos = new Set([state.challenge!.id]);
  for (let i = 1; i < total; i++) {
    state = bombTick(armBomb(state, T0, fixo(0.5)), T0 + 999_999);
    state = nextRound({ ...state, settings: { ...state.settings, totalRounds: 0 } }, rng);
    assert.equal(vistos.has(state.challenge!.id), false, `repetiu "${state.challenge!.text}"`);
    vistos.add(state.challenge!.id);
  }
  // Esgotado, ele volta a sortear do baralho inteiro em vez de ficar sem desafio.
  state = bombTick(armBomb(state, T0, fixo(0.5)), T0 + 999_999);
  assert.ok(nextRound({ ...state, settings: { ...state.settings, totalRounds: 0 } }, rng).challenge);
});

/* ------------------------------------------------------------ falso alarme */

test('falso alarme é raro, fica longe da explosão e não encosta na bomba', () => {
  const s = { ...DEFAULT_BOMB_SETTINGS };
  let comAlarme = 0;
  for (let i = 0; i < 300; i++) {
    const rng = seeded(i * 31 + 1);
    const armed = armBomb(createBombMatch(players, s, T0, rng), T0, rng);
    if (armed.pendingAlarms.length === 0) continue;
    comAlarme++;
    const fuse = armed.explodeAt! - T0;
    for (const at of armed.pendingAlarms) {
      const fracao = (at - T0) / fuse;
      assert.ok(fracao >= 0.25 && fracao <= 0.55, `susto em ${(fracao * 100).toFixed(0)}% do pavio: perto demais do fim`);
    }
  }
  const taxa = comAlarme / 300;
  assert.ok(taxa > 0.01 && taxa < 0.2, `sustos em ${(taxa * 100).toFixed(0)}% das rodadas — fora da faixa combinada`);

  // O susto conta na tela, mas não mexe no pavio nem na fase.
  const rng = seeded(31);
  let armed = armBomb(createBombMatch(players, s, T0, rng), T0, rng);
  while (armed.pendingAlarms.length === 0) armed = armBomb(createBombMatch(players, s, T0, rng), T0, rng);
  const alarme = armed.pendingAlarms[0];
  const depois = bombTick(armed, alarme);
  assert.equal(depois.alarmCount, 1);
  assert.equal(depois.phase, 'armed');
  assert.equal(depois.explodeAt, armed.explodeAt);
  assert.deepEqual(depois.pendingAlarms, [], 'o susto não se repete');
});

/* ------------------------------------------------------------- destaques */

const nomeDe = (state: BombState, id: string) => state.players.find((p) => p.id === id)!.name;

test('destaques saem do que aconteceu, e não inventam quem não jogou', () => {
  let state = match({ totalRounds: 2 }, seeded(13));
  for (let r = 0; r < 2; r++) {
    state = armBomb(state, T0, fixo(0.9));
    // Uma passagem rápida e uma demorada, para separar "mão rápida" de "pensador".
    state = passBomb(state, T0 + 800);
    state = passBomb(state, T0 + 9_000);
    state = bombTick(state, state.explodeAt!);
    if (r === 0) state = nextRound(state, seeded(99));
  }

  const lista = highlights(state);
  assert.ok(lista.some((h) => h.key === 'frio'), 'faltou o sangue frio');
  assert.ok(lista.some((h) => h.key === 'rapido'), 'faltou a mão rápida');
  const rapido = lista.find((h) => h.key === 'rapido')!;
  const pensador = lista.find((h) => h.key === 'pensador');
  assert.notEqual(rapido.playerId, pensador?.playerId, 'a mesma pessoa não pode ser as duas');
  // O destaque do nome não repete o nome: o título já traz.
  const ima = lista.find((h) => h.key === 'ima');
  if (ima) assert.ok(!ima.value.includes(nomeDe(state, ima.playerId)), 'o valor repetiu o nome que o título já mostra');
  for (const h of lista) assert.ok(players.some((p) => p.id === h.playerId), 'destaque de alguém que não está na partida');

  // Sem passagem nenhuma não há o que destacar além da bomba.
  const parado: BombState = bombTick(armBomb(match({}, seeded(1)), T0, fixo(0.5)), T0 + 999_999);
  assert.deepEqual(
    highlights(parado).map((h) => h.key),
    [],
    'ninguém passou a bomba: nada a destacar',
  );
});

/* ------------------------------------------------------------ configuração */

test('sanitizeBombSettings descarta lixo e mantém a faixa coerente', () => {
  const limpo = sanitizeBombSettings({ categories: ['Caos', 'Inventada'], difficulties: [], lives: 99, totalRounds: -3, minSeconds: 45, maxSeconds: 10 });
  assert.deepEqual(limpo.categories, ['Caos']);
  assert.deepEqual(limpo.difficulties, DEFAULT_BOMB_SETTINGS.difficulties);
  assert.equal(limpo.lives, 5);
  assert.equal(limpo.totalRounds, 0);
  assert.ok(limpo.maxSeconds >= limpo.minSeconds, 'teto abaixo do piso deixaria o sorteio sem faixa');
  assert.deepEqual(sanitizeBombSettings(undefined), DEFAULT_BOMB_SETTINGS);
});

test('"pensador" só aparece quando os tempos realmente diferem', () => {
  // Todo mundo com o mesmo ritmo: dois prêmios para o mesmo número não diriam nada.
  let iguais = armBomb(match({ totalRounds: 1 }, seeded(17)), T0, fixo(0.95));
  for (let i = 1; i <= 3; i++) iguais = passBomb(iguais, T0 + i * 1_000);
  iguais = bombTick(iguais, iguais.explodeAt!);
  const chaves = highlights(iguais).map((h) => h.key);
  assert.ok(chaves.includes('rapido'));
  assert.ok(!chaves.includes('pensador'), 'com tempos parecidos, o oposto não vira destaque');

  // Um demorando muito mais que o outro: aí o contraste é real e vale contar.
  let distintos = armBomb(match({ totalRounds: 1 }, seeded(17)), T0, fixo(0.99));
  distintos = passBomb(distintos, T0 + 300);
  distintos = passBomb(distintos, T0 + 12_000);
  distintos = bombTick(distintos, distintos.explodeAt!);
  assert.ok(highlights(distintos).some((h) => h.key === 'pensador'));
});

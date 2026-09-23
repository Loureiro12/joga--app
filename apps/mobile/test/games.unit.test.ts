/**
 * O catálogo é do app, mas as palavras são do engine. Se as duas listas saírem de sincronia,
 * nada quebra visivelmente: quem escolher uma categoria que o engine não conhece joga com outra,
 * sorteada em silêncio. Este teste é o que impede isso.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { IMPOSTOR_CATEGORIES, categoryWords, type RoomPhase } from '@jogae/engine';

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

/**
 * A Bomba-Relógio inteira depende de ninguém saber quanto falta. A tensão na tela é teatro —
 * se algum efeito visual acompanhasse o pavio, o grupo aprenderia a ler a tela em duas partidas
 * e o jogo perderia a graça. Este teste guarda essa fronteira olhando o código: a animação não
 * pode nem ter acesso ao instante da explosão.
 */
test('nem a animação nem o som têm como saber quando a bomba estoura', async () => {
  const { readFile } = await import('node:fs/promises');
  const ler = (caminho: string) => readFile(new URL(caminho, import.meta.url), 'utf8');

  for (const arquivo of ['../src/features/bomb/components/BurningFuse.tsx', '../src/features/bomb/useBombSound.ts']) {
    const fonte = await ler(arquivo);
    for (const proibido of ['explodeAt', 'useBombMatch', 'bombStore', 'pendingAlarms', 'heldSince']) {
      assert.ok(!fonte.includes(proibido), `${arquivo} toca em "${proibido}" — daria para ler o tempo restante`);
    }
    // Sorteia o próprio ritmo; é isso que o mantém descolado da bomba.
    assert.ok(fonte.includes('Math.random()'), `${arquivo}: sem sorteio próprio, o ritmo vira previsível`);
  }

  // O som de "tempo acabando" só pode tocar no susto falso. Tocá-lo de verdade perto do fim
  // seria um aviso — e o jogo vive de ninguém saber quando acaba.
  const som = await ler('../src/features/bomb/useBombSound.ts');
  const toques = som.match(/playSound\('tempoAcabando'/g) ?? [];
  assert.equal(toques.length, 1, 'o som de fim é tocado em mais de um lugar; só o susto pode dispará-lo');
  // E o único toque tem de estar dentro do efeito que observa os sustos.
  const efeitoDoSusto = som.slice(som.indexOf('sustos.current = alarmCount'));
  assert.ok(efeitoDoSusto.includes("playSound('tempoAcabando')"), 'o som de fim saiu de dentro do susto');
});

/**
 * Sair no meio precisa existir em toda tela de partida, não só nas que alguém lembrou de cobrir.
 * O menu mora no layout do fluxo (`MatchLayout`), então é ele que garante a cobertura — se
 * alguém o tirar de lá para pôr numa tela só, este teste avisa.
 */
test('a saída da partida fica no layout, não espalhada pelas telas', async () => {
  const { readFile } = await import('node:fs/promises');
  const layout = await readFile(new URL('../src/features/match/MatchLayout.tsx', import.meta.url), 'utf8');
  assert.ok(layout.includes('<MatchMenu />'), 'sem o menu no layout, telas novas nascem sem saída');
  // No Android, o botão físico de voltar tem de levar ao menu em vez de não fazer nada.
  assert.ok(layout.includes('openMatchMenu'), 'o botão físico de voltar deixou de abrir o menu');

  const bomba = await readFile(new URL('../src/features/bomb/screens/BombRoundScreen.tsx', import.meta.url), 'utf8');
  // A Bomba-Relógio não tem sala para deixar: a saída dela é encerrar ou descartar.
  assert.ok(bomba.includes('bombActions.endMatch'), 'falta encerrar e ver o resultado');
  assert.ok(bomba.includes('bombActions.leave'), 'falta descartar a partida');
});

test('toda fase de partida tem saída — inclusive as dos jogos novos', async () => {
  const { hasMatchToLeave } = await import('../src/features/match/matchPhase');

  // Se um jogo novo trouxer uma fase, ela cai aqui e precisa de uma decisão consciente.
  const emJogo: RoomPhase[] = ['role_reveal', 'clues', 'question', 'voting', 'revealing'];
  for (const fase of emJogo) assert.equal(hasMatchToLeave(fase), true, `a fase "${fase}" ficou sem saída`);

  // Nestas não há partida para abandonar: o lobby tem o próprio "Fechar" e o resto já acabou.
  for (const fase of ['lobby', 'finished', 'closed'] as RoomPhase[]) assert.equal(hasMatchToLeave(fase), false, `"${fase}" não deveria oferecer saída`);
});

test('as duas bombas são locais e apontam para a variante certa do motor', () => {
  const classico = getGame('bomba-relogio')!;
  const alfabeto = getGame('bomba-alfabeto')!;
  for (const jogo of [classico, alfabeto]) {
    assert.equal(jogo.device, 'local', `${jogo.id} precisa ser local`);
    assert.equal(jogo.engineId, undefined, `${jogo.id} não pode apontar para um motor de sala`);
    assert.equal(jogo.playable, true);
  }
  assert.equal(classico.bombVariant, 'classico');
  assert.equal(alfabeto.bombVariant, 'alfabeto');
  // Sem a variante, o fluxo local cairia sempre no clássico sem avisar.
  assert.ok(GAMES.filter((g) => g.device === 'local').every((g) => g.bombVariant), 'jogo local sem variante definida');
});

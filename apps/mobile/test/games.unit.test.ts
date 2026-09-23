/**
 * O catálogo é do app, mas as palavras são do engine. Se as duas listas saírem de sincronia,
 * nada quebra visivelmente: quem escolher uma categoria que o engine não conhece joga com outra,
 * sorteada em silêncio. Este teste é o que impede isso.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { IMPOSTOR_CATEGORIES, SECRET_CONTEXTS, categoryWords, countMissions, type RoomPhase, type SecretContext } from '@jogae/engine';

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
  const emJogo: RoomPhase[] = ['role_reveal', 'clues', 'question', 'voting', 'revealing', 'briefing', 'mission', 'verdict'];
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
  // Nem todo jogo local é bomba: o Entre Nós tem fluxo próprio. A cobertura de "todo jogo local
  // sabe por onde entra" está no teste seguinte.
});

/**
 * O aviso de passagem cobre a tela por meio segundo. Se ele bloqueasse o toque, quem recebeu a
 * bomba perderia esse tempo sem poder jogar — com o pavio correndo por baixo.
 */
test('o aviso de passagem nunca bloqueia o toque', async () => {
  const { readFile } = await import('node:fs/promises');
  const flash = await readFile(new URL('../src/features/bomb/components/HandoffFlash.tsx', import.meta.url), 'utf8');
  assert.match(flash, /pointerEvents="none"/, 'o flash passou a capturar toques');
  // E não pode saber do pavio, como o resto da tensão da bomba.
  for (const proibido of ['explodeAt', 'bombStore', 'pendingAlarms']) {
    assert.ok(!flash.includes(proibido), `o flash toca em "${proibido}"`);
  }
});

test('Entre Nós é local, para duas pessoas, e tem fluxo próprio', () => {
  const jogo = getGame('entre-nos')!;
  assert.equal(jogo.device, 'local');
  assert.equal(jogo.localFlow, 'casal', 'sem isso o catálogo mandaria o casal para a tela da bomba');
  assert.equal(jogo.engineId, undefined);
  assert.equal(jogo.bombVariant, undefined, 'não é uma bomba');
  // O jogo foi feito para um casal: abrir para mais gente mudaria a natureza das perguntas.
  assert.deepEqual([jogo.minPlayers, jogo.maxPlayers], [2, 2]);
});

test('todo jogo local diz por qual fluxo entra', () => {
  for (const jogo of GAMES.filter((g) => g.device === 'local' && g.playable)) {
    assert.ok(jogo.bombVariant || jogo.localFlow, `${jogo.id} é local mas não diz por onde começa`);
  }
});

/**
 * O Desafio Secreto é o único jogo em que a "categoria" da tela não é categoria: é o lugar onde o
 * grupo está, e é ele que decide quais missões podem cair. Os dois lados dessa lista moram em
 * arquivos diferentes — se saírem de sincronia, o host escolhe "churrasco" e o motor joga com
 * outro baralho, sem nenhum aviso.
 */
test('os lugares oferecidos na tela são os que o motor do Desafio Secreto conhece', () => {
  const secreto = getGame('desafio-secreto')!;
  assert.equal(secreto.playable, true);
  assert.equal(secreto.engineId, 'secret', 'o jogo precisa de sala: cada missão é privada');
  assert.equal(secreto.device, undefined, 'não é de um celular só');

  const oferecidos = secreto.wordCategories.map((c) => c.id);
  assert.deepEqual(oferecidos.filter((id) => !(SECRET_CONTEXTS as readonly string[]).includes(id)), [], 'lugar na tela que o motor não conhece');
  assert.deepEqual(SECRET_CONTEXTS.filter((c) => !oferecidos.includes(c)), [], 'lugar com missões que ninguém consegue escolher');
  assert.ok(oferecidos.includes(secreto.defaults.category), 'o lugar padrão não está entre as opções');

  // E o padrão tem que dar partida para a maior sala: 12 missões distintas mais as falsas.
  const quantas = countMissions({ context: secreto.defaults.category as SecretContext, difficulties: ['facil', 'media'], accusations: 2, swaps: 1, competitive: false });
  assert.ok(quantas >= secreto.maxPlayers + 3, `o lugar padrão só tem ${quantas} missões`);
});

/**
 * A missão só pode existir na tela enquanto o dedo está nela. O jogo acontece com todos lado a
 * lado, olhando de esguelha: uma tela que deixasse a missão à mostra entregaria o jogo no primeiro
 * descuido. Por isso nenhuma tela do Desafio Secreto imprime a própria missão fora do `HoldToReveal`.
 */
test('a missão nunca fica à mostra: as telas do segredo só a mostram sob o dedo', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const tela of ['BriefingScreen', 'MissionScreen']) {
    const src = await readFile(new URL(`../src/features/match/screens/secret/${tela}.tsx`, import.meta.url), 'utf8');
    assert.ok(src.includes('<HoldToReveal'), `${tela} mostra a missão sem exigir o dedo na tela`);
    const [antes] = src.split('<HoldToReveal');
    assert.ok(!antes.includes('mine.mission.text'), `${tela} imprime a missão antes do HoldToReveal`);
  }

  // A tela da revelação é o oposto: ali a missão é pública, e é o fim do jogo.
  const verdict = await readFile(new URL('../src/features/match/screens/secret/VerdictScreen.tsx', import.meta.url), 'utf8');
  assert.ok(!verdict.includes('HoldToReveal'), 'na hora da verdade a missão é do grupo, não mais de quem a recebeu');
});

/**
 * O botão de sair mora no canto superior direito de toda tela de partida. Uma tela que escreva
 * ali — a rodada, a categoria, quantas acusações restam — precisa desviar dele, e descobrir isso
 * só na hora de olhar o celular já custou uma colisão em cinco telas. `MatchTopRow` reserva o
 * espaço; este teste é o que impede a próxima tela de esquecer.
 */
test('nenhuma tela de partida escreve por baixo do botão de sair', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const base = new URL('../src/features/match/screens/', import.meta.url);
  const arquivos: string[] = [];
  for (const entrada of await readdir(base, { withFileTypes: true })) {
    if (entrada.isDirectory()) {
      for (const filho of await readdir(new URL(entrada.name + '/', base))) arquivos.push(`${entrada.name}/${filho}`);
    } else if (entrada.name.endsWith('.tsx')) arquivos.push(entrada.name);
  }

  // Estas não estão em partida: o menu de saída não aparece nelas, então o canto é livre.
  const semMenu = ['LobbyScreen.tsx', 'EndScreen.tsx', 'AbortedScreen.tsx', 'CreateMatchScreen.tsx', 'JoinRoomScreen.tsx', 'RankingScreen.tsx'];

  for (const arquivo of arquivos.filter((f) => f.endsWith('.tsx') && !semMenu.some((s) => f.endsWith(s)))) {
    const src = await readFile(new URL(arquivo, base), 'utf8');
    // A primeira linha da tela: o que vem logo depois do <Screen> de abertura.
    const inicio = src.indexOf('<Screen');
    if (inicio < 0) continue;
    const topo = src.slice(inicio, inicio + 600);
    if (!topo.includes("justifyContent: 'space-between'")) continue;
    assert.ok(
      src.includes('<MatchTopRow>'),
      `${arquivo} abre com uma linha de canto a canto sem MatchTopRow: o ✕ cai em cima do texto da direita`,
    );
  }
});

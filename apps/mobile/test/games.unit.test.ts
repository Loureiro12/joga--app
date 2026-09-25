/**
 * O catálogo é do app, mas as palavras são do engine. Se as duas listas saírem de sincronia,
 * nada quebra visivelmente: quem escolher uma categoria que o engine não conhece joga com outra,
 * sorteada em silêncio. Este teste é o que impede isso.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  IMPOSTOR_CATEGORIES,
  PERFECT_CATEGORIES,
  PERFECT_LENGTHS,
  SECRET_CONTEXTS,
  SPICY_CATEGORY,
  categoryWords,
  countMissions,
  countPerfectQuestions,
  sanitizePerfectSettings,
  type RoomPhase,
  type SecretContext,
} from '@jogae/engine';

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

test('a Bomba-Relógio joga dos dois jeitos, e sabe entrar por cada um', () => {
  const bomba = getGame('bomba-relogio')!;
  assert.equal(bomba.playable, true);
  assert.equal(bomba.device, 'ambos', 'um celular só, ou cada um no seu');
  // Os dois caminhos precisam existir: sem o motor não há sala; sem a variante não há tela local.
  assert.equal(bomba.engineId, 'bomb');
  assert.equal(bomba.bombVariant, 'classico');
  assert.equal(bomba.wordCategories.length, 0, 'as categorias dele vêm do engine, por variante');
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
  const emJogo: RoomPhase[] = ['role_reveal', 'clues', 'question', 'voting', 'revealing', 'briefing', 'mission', 'verdict', 'pairing', 'answering', 'handoff', 'armed'];
  for (const fase of emJogo) assert.equal(hasMatchToLeave(fase), true, `a fase "${fase}" ficou sem saída`);

  // Nestas não há partida para abandonar: o lobby tem o próprio "Fechar" e o resto já acabou.
  for (const fase of ['lobby', 'finished', 'closed'] as RoomPhase[]) assert.equal(hasMatchToLeave(fase), false, `"${fase}" não deveria oferecer saída`);
});

test('as duas bombas apontam para a variante certa e para o mesmo motor de sala', () => {
  const classico = getGame('bomba-relogio')!;
  const alfabeto = getGame('bomba-alfabeto')!;
  for (const jogo of [classico, alfabeto]) {
    assert.equal(jogo.device, 'ambos', `${jogo.id} precisa oferecer os dois modos`);
    assert.equal(jogo.engineId, 'bomb', `${jogo.id} precisa do motor de sala`);
    assert.equal(jogo.playable, true);
  }
  assert.equal(classico.bombVariant, 'classico');
  assert.equal(alfabeto.bombVariant, 'alfabeto');
  // As duas usam o MESMO motor: é a variante que muda a rodada, não o jogo.
  assert.equal(classico.engineId, alfabeto.engineId);
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
  for (const jogo of GAMES.filter((g) => (g.device === 'local' || g.device === 'ambos') && g.playable)) {
    assert.ok(jogo.bombVariant || jogo.localFlow, `${jogo.id} joga local mas não diz por onde começa`);
  }
  // E quem joga em sala precisa de motor, inclusive os que também jogam local.
  for (const jogo of GAMES.filter((g) => (g.device === undefined || g.device === 'sala' || g.device === 'ambos') && g.playable)) {
    assert.ok(jogo.engineId, `${jogo.id} joga em sala mas não tem motor`);
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

/**
 * Como no Impostor, as categorias da tela e as do banco moram em arquivos diferentes. Se saírem
 * de sincronia, o host marca "Comida" e o motor sorteia de outro baralho, sem nenhum aviso.
 */
test('as categorias do Casal Perfeito na tela são as que o motor conhece', () => {
  const jogo = getGame('casal-perfeito')!;
  assert.equal(jogo.playable, true);
  assert.equal(jogo.engineId, 'perfect', 'cada um responde no próprio celular: o jogo precisa de sala');
  assert.equal(jogo.device, undefined);

  const oferecidas = jogo.wordCategories.map((c) => c.id);
  assert.deepEqual(oferecidas.filter((id) => !(PERFECT_CATEGORIES as readonly string[]).includes(id)), [], 'categoria na tela que o motor não conhece');
  assert.deepEqual(PERFECT_CATEGORIES.filter((c) => !oferecidas.includes(c)), [], 'categoria com perguntas que ninguém consegue escolher');

  // A picante precisa estar na tela para poder ser marcada — é assim que ela entra (§21).
  assert.ok(oferecidas.includes(SPICY_CATEGORY), 'sem o chip, a categoria opt-in seria inacessível');
  assert.equal(jogo.wordCategories[jogo.wordCategories.length - 1].id, SPICY_CATEGORY, 'a mais provocativa deveria ser a última da lista');

  // A partida padrão precisa de baralho para não repetir pergunta.
  const padrao = countPerfectQuestions(sanitizePerfectSettings({ categories: [] }));
  assert.ok(padrao >= jogo.defaults.rounds, `o padrão pede ${jogo.defaults.rounds} perguntas e a seleção tem ${padrao}`);
  for (const n of jogo.roundOptions) assert.ok((PERFECT_LENGTHS as readonly number[]).includes(n), `${n} não é uma duração que o motor conhece`);
});

/**
 * A resposta de um não pode aparecer no celular do outro antes da revelação — é o jogo inteiro.
 * O motor já garante isso no snapshot; aqui o alvo é a tela, que não pode ler o estado por outro
 * caminho nem mostrar tendência de voto enquanto todo mundo responde (§32, §69).
 */
test('a tela de responder não tem como mostrar a resposta de mais ninguém', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/features/match/screens/perfect/AnswerScreen.tsx', import.meta.url), 'utf8');

  // Só a própria resposta vem no snapshot; qualquer outra leitura seria por fora do contrato.
  assert.ok(src.includes('myAnswer'), 'a tela precisa saber se EU já respondi');
  for (const proibido of ['votedIds.map', 'answers[', 'result?.couples', 'useMatchStore.getState']) {
    assert.ok(!src.includes(proibido), `a tela de responder toca em "${proibido}"`);
  }
  // "8 de 10 responderam" pode; "3 votos na praia" não.
  assert.ok(src.includes('votes?.total'), 'faltou o quantos já responderam');
});

/**
 * A Bomba em sala repete a regra de ouro da versão de um celular: **nada na tela pode saber
 * quando ela estoura**. Lá o perigo era a animação; aqui é maior, porque a tela lê um snapshot
 * que vem pela rede — se um dia o pavio entrar nele, é aqui que o teste avisa.
 */
test('a tela da bomba em sala não tem como saber quando ela estoura', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/features/match/screens/bomb/BombRoomScreen.tsx', import.meta.url), 'utf8');

  for (const proibido of ['explodeAt', 'pendingAlarms', 'heldSince', 'remainingSec', 'setInterval']) {
    assert.ok(!src.includes(proibido), `a tela da bomba em sala toca em "${proibido}"`);
  }
  // A explosão chega como mudança de fase, vinda do servidor — e não de uma conta local.
  assert.ok(src.includes("phase === 'exploded'"), 'a tela não reage à explosão do servidor');
  // E o aviso da vez é o pedido do jogo: duas batidas.
  assert.ok(src.includes('haptics.turn()'), 'sumiu a vibração de "é a sua vez"');
});

test('a vibração de "é a sua vez" são duas batidas, e respeita a configuração do usuário', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/core/utils/haptics.ts', import.meta.url), 'utf8');
  const turn = src.slice(src.indexOf('turn:'));
  // Duas, e não uma: com o celular na mesa, uma batida só se confunde com notificação.
  assert.equal((turn.match(/haptics\.heavy\(\)/g) ?? []).length, 2, 'a vibração de vez não tem duas batidas');
  // Passa pelo `run`, que é quem respeita o ajuste "Vibração" do app.
  assert.ok(src.includes('config.isEnabled()'), 'a vibração deixou de respeitar a configuração');
});

/**
 * Anúncio dentro de uma rodada é o erro caro deste app: os celulares estão sincronizados pelo
 * servidor, e na Bomba-Relógio o pavio continua queimando atrás da tela cheia — a pessoa
 * perderia a rodada por causa do Jogaê.
 *
 * O teste varre as telas: só as de FIM podem citar o módulo de anúncios.
 */
test('nenhuma tela de jogo chama anúncio fora do fim da partida', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const base = new URL('../src/features/', import.meta.url);

  const telas: string[] = [];
  const varrer = async (dir: string) => {
    for (const entrada of await readdir(new URL(dir, base), { withFileTypes: true })) {
      const caminho = `${dir}${entrada.name}`;
      if (entrada.isDirectory()) await varrer(`${caminho}/`);
      else if (entrada.name.endsWith('.tsx')) telas.push(caminho);
    }
  };
  for (const feature of ['match/', 'bomb/', 'couple/']) await varrer(feature);
  assert.ok(telas.length > 20, 'a varredura não achou as telas');

  // Quem pode: as telas de fim de partida, e só elas.
  const podeSair = /End(Screen)?\.tsx$|BombRoomScreen\.tsx$/;

  for (const tela of telas) {
    const src = await readFile(new URL(tela, base), 'utf8');
    if (!src.includes('exitAfterMatch') && !src.includes('exitLocalMatch') && !src.includes('services.ads')) continue;
    assert.ok(podeSair.test(tela), `${tela} chama anúncio e não é tela de fim de partida`);
  }

  // E a do Entre Nós não chama nem no fim: a decisão está escrita lá e aqui.
  const casal = await readFile(new URL('couple/screens/CoupleEndScreen.tsx', base), 'utf8');
  assert.ok(!casal.includes('exitAfterMatch') && !casal.includes('exitLocalMatch'), 'o Entre Nós passou a mostrar anúncio');
  assert.ok(casal.includes('Sem anúncio aqui'), 'sumiu o comentário que explica por que o Entre Nós não tem anúncio');
});

/**
 * O SDK do AdMob derruba o app na subida quando o app id está ausente ou inválido. Enquanto não
 * houver conta, a flag precisa continuar desligada — e o serviço simulado no lugar dele.
 */
test('anúncios ficam desligados enquanto não houver conta no AdMob', async () => {
  const { features } = await import('../src/core/config/features');
  const { readFile } = await import('node:fs/promises');

  assert.equal(features.ads, false, 'ligar a flag sem os ids do AdMob derruba o app na abertura');

  // O SDK é carregado por require preguiçoso: sem o módulo, o app segue funcionando.
  const google = await readFile(new URL('../src/features/ads/GoogleAdsService.ts', import.meta.url), 'utf8');
  assert.ok(google.includes("require('react-native-google-mobile-ads')"), 'o SDK deixou de ser opcional');
  assert.ok(google.includes('__DEV__'), 'sumiu a trava que impede anúncio real em desenvolvimento');
});

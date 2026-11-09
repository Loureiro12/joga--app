import assert from 'node:assert/strict';
import { test } from 'node:test';

import { THEMES } from '../src/games/alphabet-themes';
import { CHALLENGES } from '../src/games/bomb-challenges';
import {
  DEFAULT_ALPHABET_SETTINGS,
  DEFAULT_BOMB_SETTINGS,
  EMPTY_BOMB_CONTENT,
  countChallenges,
  countThemes,
  createBombMatch,
  nextRound,
  pickChallenge,
  pickTheme,
  sanitizeGeneratedChallenges,
  sanitizeGeneratedThemes,
  type BombContent,
  type BombPlayer,
  type BombSettings,
  type BombState,
} from '../src/index';

/**
 * A repetição de palavras — o problema que o grupo sentia na mesa.
 *
 * Havia duas causas, e a menos óbvia era a maior:
 *
 * 1. **A memória morria com a partida.** `usedChallengeIds` garante que nada repita DENTRO de uma
 *    partida, e depois é jogado fora. Então um grupo que jogava toda semana recomeçava o sorteio
 *    do zero toda semana — e com 180 cartas, reencontrar as mesmas é o resultado esperado, não
 *    azar. A correção (`content.seenIds`) não depende de IA nenhuma e funciona offline.
 *
 * 2. **O banco do Alfabeto é pequeno:** 18 temas, 3 por categoria. Uma categoria marcada dá 3
 *    temas, e a partida padrão tem 5 rodadas — repetia dentro dela mesma. É aqui que a geração
 *    entra, somando cartas ao baralho.
 *
 * O que estes testes protegem: as duas correções, e principalmente o fato de o motor continuar
 * funcionando **igual** quando não há conteúdo gerado nenhum. Esse é o caminho de todo dia.
 */

const seeded = (seed: number) => {
  let x = seed;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
};

const jogadores: BombPlayer[] = [
  { id: 'a', name: 'Ana', color: '#7C3AED' },
  { id: 'b', name: 'Bia', color: '#FACC15' },
];

/** Joga a partida inteira e devolve os ids das cartas que saíram, na ordem. */
function cartasDaPartida(settings: Partial<BombSettings>, content: BombContent, seed = 7): string[] {
  let state: BombState = createBombMatch(jogadores, settings, 1_000, seeded(seed), content);
  const vistas = [state.settings.variant === 'alfabeto' ? state.alphabet!.themeId : state.challenge!.id];
  const rodadas = state.settings.totalRounds || 5;
  for (let i = 1; i < rodadas; i++) {
    state = nextRound({ ...state, phase: 'exploded', loserId: 'a' }, seeded(seed + i));
    if (state.phase === 'finished') break;
    vistas.push(state.settings.variant === 'alfabeto' ? state.alphabet!.themeId : state.challenge!.id);
  }
  return vistas;
}

const conteudo = (campos: Partial<BombContent> = {}): BombContent => ({ ...EMPTY_BOMB_CONTENT, ...campos });

/* ─────────────── sem conteúdo gerado, nada mudou ─────────────── */

test('sem conteúdo gerado o jogo é exatamente o que era: só o banco local', () => {
  // O caminho de todo dia. Sem rede, sem login, sem chave de API — e é o único caminho no
  // modo de um celular até a geração chegar.
  const partida = createBombMatch(jogadores, DEFAULT_BOMB_SETTINGS, 1_000, seeded(3));
  assert.deepEqual(partida.content, EMPTY_BOMB_CONTENT);
  assert.ok(partida.challenge, 'a partida nasceu sem desafio');
  assert.ok(
    CHALLENGES.some((c) => c.id === partida.challenge!.id),
    'a carta não veio do banco local',
  );
  assert.equal(countChallenges(DEFAULT_BOMB_SETTINGS), countChallenges(DEFAULT_BOMB_SETTINGS, EMPTY_BOMB_CONTENT));
});

test('o conteúdo não vaza para dentro da carta sorteada', () => {
  // Uma carta gerada é uma `BombChallenge` como qualquer outra. Se a tela precisasse saber a
  // origem para desenhar, a feature teria vazado para dentro do jogo — e não vazou.
  const geradas = sanitizeGeneratedChallenges([{ text: 'Diga algo que cabe numa mochila.', category: 'Comida', difficulty: 'facil', pool: 'alto' }], {
    categories: ['Comida'],
  });
  const carta = pickChallenge({ ...DEFAULT_BOMB_SETTINGS, categories: ['Comida'] }, new Set(CHALLENGES.map((c) => c.id)), seeded(5), conteudo({ challenges: geradas }));
  assert.deepEqual(Object.keys(carta).sort(), ['category', 'difficulty', 'id', 'pool', 'text']);
});

/* ─────────────── a memória entre partidas ─────────────── */

test('o que o grupo já viu não volta enquanto houver carta inédita', () => {
  const settings = { ...DEFAULT_BOMB_SETTINGS, categories: ['Comida'], difficulties: ['facil' as const] };
  const doBanco = CHALLENGES.filter((c) => c.category === 'Comida' && c.difficulty === 'facil');
  assert.ok(doBanco.length >= 4, 'o teste precisa de algumas cartas para ter o que evitar');

  const vistas = doBanco.slice(0, 2).map((c) => c.id);
  for (let seed = 1; seed <= 30; seed++) {
    const carta = pickChallenge(settings, new Set(), seeded(seed), conteudo({ seenIds: vistas }));
    assert.ok(!vistas.includes(carta.id), `saiu uma carta já vista (seed ${seed}): ${carta.text}`);
  }
});

test('duas partidas seguidas do mesmo grupo não repetem carta', () => {
  // É literalmente a queixa: "hoje os jogos de bomba geram palavras repetidas". Antes, a segunda
  // partida sorteava do baralho inteiro de novo; agora a primeira deixa rastro.
  const settings = { ...DEFAULT_BOMB_SETTINGS, categories: ['Festa'], totalRounds: 5 };
  const primeira = cartasDaPartida(settings, EMPTY_BOMB_CONTENT, 11);
  const segunda = cartasDaPartida(settings, conteudo({ seenIds: primeira }), 11);

  assert.equal(primeira.length, 5);
  const repetidas = segunda.filter((id) => primeira.includes(id));
  assert.deepEqual(repetidas, [], `a segunda partida repetiu ${repetidas.length} cartas da primeira`);
});

test('quando a memória engole o baralho, a rodada acontece de qualquer jeito', () => {
  // O terceiro nível de recuo. Ficar sem carta na mesa seria pior do que repetir — então, no
  // limite, repete. O que não pode é a rodada abrir vazia.
  const settings = { ...DEFAULT_BOMB_SETTINGS, categories: ['Caos'] };
  const tudo = CHALLENGES.map((c) => c.id);
  const carta = pickChallenge(settings, new Set(tudo), seeded(2), conteudo({ seenIds: tudo }));
  assert.ok(carta, 'o sorteio devolveu nada com tudo já visto');
  assert.ok(carta.text.length > 0);
});

test('a partida da vez continua tendo prioridade sobre a memória antiga', () => {
  // Repetir dentro da mesma partida é o que mais incomoda, então "não usado hoje" vale mais do
  // que "nunca visto": entre uma carta de outro dia e uma que acabou de sair, vem a de outro dia.
  const settings = { ...DEFAULT_BOMB_SETTINGS, categories: ['Música'], difficulties: ['facil' as const] };
  const musica = CHALLENGES.filter((c) => c.category === 'Música' && c.difficulty === 'facil').map((c) => c.id);
  const todasMenosUma = musica.slice(1);

  // Tudo visto em outro dia, e tudo menos uma já usado HOJE: tem de sair a que falta.
  const carta = pickChallenge(settings, new Set(todasMenosUma), seeded(4), conteudo({ seenIds: musica }));
  assert.equal(carta.id, musica[0]);
});

/* ─────────────── o baralho que cresce ─────────────── */

test('carta gerada entra no baralho e pode sair na rodada', () => {
  const geradas = sanitizeGeneratedChallenges(
    Array.from({ length: 6 }, (_, i) => ({ text: `Diga algo que cabe numa gaveta número ${i}.`, category: 'Caos', difficulty: 'facil', pool: 'alto' })),
    { categories: ['Caos'], difficulties: ['facil'] },
  );
  assert.equal(geradas.length, 6, 'as cartas de teste não passaram pela portaria');

  const settings = { ...DEFAULT_BOMB_SETTINGS, categories: ['Caos'], difficulties: ['facil' as const] };
  const soDoBanco = countChallenges(settings);
  assert.equal(countChallenges(settings, conteudo({ challenges: geradas })), soDoBanco + 6, 'o contador da tela não somou as geradas');

  // Com o banco inteiro já visto, só pode sair carta gerada.
  const carta = pickChallenge(settings, new Set(), seeded(9), conteudo({ challenges: geradas, seenIds: CHALLENGES.map((c) => c.id) }));
  assert.ok(
    geradas.some((g) => g.id === carta.id),
    `deveria ter saído carta gerada, saiu: ${carta.text}`,
  );
});

test('o Alfabeto era o caso mais grave, e a geração resolve justo ele', () => {
  // 3 temas numa categoria contra 5 rodadas: a partida repetia dentro dela mesma, sem ninguém
  // ter feito nada errado. É o número que justificou esta feature.
  const settings = { ...DEFAULT_ALPHABET_SETTINGS, categories: ['Natureza'] };
  const soBanco = countThemes(settings);
  assert.ok(soBanco < settings.totalRounds, `o banco do Alfabeto deixou de ser o gargalo (${soBanco} temas para ${settings.totalRounds} rodadas)`);

  const semIA = cartasDaPartida(settings, EMPTY_BOMB_CONTENT, 21);
  assert.ok(new Set(semIA).size < semIA.length, 'sem geração, a partida deveria repetir tema — era o defeito');

  const temas = sanitizeGeneratedThemes(
    Array.from({ length: 8 }, (_, i) => ({ name: `Bichos do mato ${i}`, emoji: '🦊', category: 'Natureza', difficulty: 'facil', letters: 'ABCDEFGHIJLMNOPRSTUV' })),
    { categories: ['Natureza'], difficulties: ['facil'] },
  );
  assert.equal(temas.length, 8);

  const comIA = cartasDaPartida(settings, conteudo({ themes: temas }), 21);
  assert.equal(new Set(comIA).size, comIA.length, `com geração a partida ainda repetiu tema: ${comIA.join(' · ')}`);
});

test('tema gerado sai com a grade de letras montada, como qualquer outro', () => {
  const [tema] = sanitizeGeneratedThemes([{ name: 'Brincadeiras', emoji: '🎉', category: 'Diversão', difficulty: 'facil', letters: 'ABCDEFGILMNOPRSTU' }], {
    categories: ['Diversão'],
  });
  const settings = { ...DEFAULT_ALPHABET_SETTINGS, categories: ['Diversão'] };
  const escolhido = pickTheme(settings, new Set(), seeded(6), conteudo({ themes: [tema], seenIds: THEMES.map((t) => t.id) }));
  assert.equal(escolhido.id, tema.id);

  const partida = createBombMatch(jogadores, settings, 1_000, seeded(6), conteudo({ themes: [tema], seenIds: THEMES.map((t) => t.id) }));
  assert.equal(partida.alphabet?.themeId, tema.id);
  assert.equal(partida.alphabet?.letters, tema.letters);
  assert.deepEqual(partida.alphabet?.used, []);
});

/* ─────────────── o conteúdo não atrapalha o resto ─────────────── */

test('o conteúdo entra na criação e não muda mais durante a partida', () => {
  // Uma carta que chegasse no meio mudaria o baralho debaixo de um sorteio já feito, e a partida
  // deixaria de ser reproduzível a partir do estado — que é o que permite testá-la.
  const content = conteudo({ seenIds: ['x'] });
  let state = createBombMatch(jogadores, DEFAULT_BOMB_SETTINGS, 1_000, seeded(8), content);
  assert.deepEqual(state.content, content);
  state = nextRound({ ...state, phase: 'exploded', loserId: 'a' }, seeded(9));
  assert.deepEqual(state.content, content, 'o conteúdo mudou entre rodadas');
});

test('o estado continua sendo JSON puro, com o conteúdo dentro', () => {
  // O motor roda no servidor de salas e atravessa a rede; qualquer coisa não serializável aqui
  // viraria uma sala que não sobrevive a um reinício.
  const geradas = sanitizeGeneratedChallenges([{ text: 'Diga algo que cabe num bolso.', category: 'Caos', difficulty: 'facil', pool: 'alto' }], { categories: ['Caos'] });
  const state = createBombMatch(jogadores, DEFAULT_BOMB_SETTINGS, 1_000, seeded(10), conteudo({ challenges: geradas, seenIds: ['a', 'b'] }));
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});


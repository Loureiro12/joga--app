import { ALPHABET_CATEGORIES, ALPHABET_RULES, canUseLetter, remainingLetters, startAlphabetRound } from './alphabet';
import { CHALLENGES } from './bomb-challenges';
import {
  DEFAULT_ALPHABET_SETTINGS,
  DEFAULT_BOMB_SETTINGS,
  type BombChallenge,
  type BombHighlight,
  type BombPlayer,
  type BombSettings,
  type BombStanding,
  type BombState,
} from './bomb-types';

export * from './bomb-types';

/**
 * Bomba-Relógio: regras puras, sem I/O e sem timers.
 *
 * O que separa este jogo dos outros dois: ele roda em UM aparelho, presencialmente, sem sala e
 * sem conta. Por isso não passa pelo `RoomEngine` — não há nada para sincronizar. O app guarda
 * este estado localmente e chama `bombTick` a cada quadro.
 *
 * Duas regras de justiça que moldam o desenho:
 * - O instante da explosão é sorteado quando a bomba acende e **nunca** é recalculado. Não depende
 *   de quem está com ela, de quantas passagens houve nem de quem está perdendo (§46).
 * - É um carimbo de tempo absoluto, não um contador de tela. Minimizar o app não segura a bomba (§45).
 */

export const BOMB_RULES = {
  /** Um aparelho só: com uma pessoa não há para quem passar. */
  minPlayers: 2,
  recommendedPlayers: 4,
  maxPlayers: 16,
  /** A bomba nunca estoura nos primeiros segundos, para a primeira pessoa não ser refém (§16). */
  safetySeconds: 8,
  points: { pass: 10, survive: 50 },
  /** Chance de a rodada ter um susto. Raro de propósito: comum, perderia a graça (§38). */
  fakeAlarmChance: 0.08,
} as const;

export const BOMB_CATEGORIES = [
  'Conhecimentos gerais',
  'Engraçado',
  'Filmes e séries',
  'Esportes',
  'Música',
  'Comida',
  'Lugares',
  'Games',
  'Festa',
  'Caos',
] as const;

const pick = <T>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)];

function matches(challenge: BombChallenge, settings: BombSettings): boolean {
  const categoriaOk = settings.categories.length === 0 || settings.categories.includes(challenge.category);
  return categoriaOk && settings.difficulties.includes(challenge.difficulty);
}

/** Quantos desafios existem para uma configuração — é o teto de rodadas sem repetir. */
export const countChallenges = (settings: BombSettings): number => CHALLENGES.filter((c) => matches(c, settings)).length;

export function pickChallenge(settings: BombSettings, usedIds: Set<string>, rng: () => number = Math.random): BombChallenge {
  const elegiveis = CHALLENGES.filter((c) => matches(c, settings));
  // Configuração impossível: cai no baralho inteiro em vez de deixar a rodada sem desafio.
  const baralho = elegiveis.length ? elegiveis : CHALLENGES;
  const novos = baralho.filter((c) => !usedIds.has(c.id));
  return pick(novos.length ? novos : baralho, rng);
}

/**
 * Sorteia quanto a bomba vai durar, em ms.
 *
 * Não é uniforme de propósito (§15): `u^0.65` empurra a massa para o fim da faixa, então
 * explosões muito precoces ficam raras e a tensão cresce. O piso de segurança é aplicado por
 * último, para valer mesmo se o grupo escolher uma faixa curta.
 */
export function drawFuse(settings: BombSettings, rng: () => number = Math.random): number {
  const min = Math.max(1, settings.minSeconds);
  const max = Math.max(min, settings.maxSeconds);
  const enviesado = min + (max - min) * Math.pow(rng(), 0.65);
  const seguranca = settings.variant === 'alfabeto' ? ALPHABET_RULES.safetySeconds : BOMB_RULES.safetySeconds;
  return Math.max(seguranca, enviesado) * 1000;
}

/**
 * Sorteia os sustos da rodada. Ficam na primeira metade do pavio: perto da explosão, um susto
 * viraria aviso — e o jogo perderia justamente a incerteza que o sustenta.
 */
function drawFakeAlarms(startedAt: number, fuseMs: number, rng: () => number): number[] {
  if (rng() >= BOMB_RULES.fakeAlarmChance) return [];
  return [startedAt + fuseMs * (0.25 + rng() * 0.3)];
}

/** Quem ainda está na partida. No modo eliminação, quem zerou as vidas sai de vez. */
export const activePlayers = (state: BombState): BombPlayer[] => state.players.filter((p) => !state.eliminated.includes(p.id));

function nextPlayerId(state: BombState, rng: () => number): string {
  const vivos = activePlayers(state);
  if (vivos.length <= 1) return state.activeId;
  if (state.settings.order === 'caos') {
    // Nunca a mesma pessoa duas vezes seguidas: receber de si mesmo não é passar.
    const outros = vivos.filter((p) => p.id !== state.activeId);
    return pick(outros, rng).id;
  }
  const i = vivos.findIndex((p) => p.id === state.activeId);
  return vivos[(i + 1) % vivos.length].id;
}

/** Estado inicial da partida, já na tela de "passe o celular para…" da primeira rodada. */
export function createBombMatch(players: BombPlayer[], settings: Partial<BombSettings>, now: number, rng: () => number = Math.random): BombState {
  const merged = { ...DEFAULT_BOMB_SETTINGS, ...settings };
  const zero = <T>(value: T) => Object.fromEntries(players.map((p) => [p.id, value]));
  const base: BombState = {
    settings: merged,
    players,
    phase: 'handoff',
    roundIndex: 1,
    challenge: null,
    alphabet: null,
    usedChallengeIds: [],
    activeId: players[0]?.id ?? '',
    explodeAt: null,
    heldSince: null,
    pendingAlarms: [],
    alarmCount: 0,
    loserId: null,
    eliminated: [],
    passes: zero(0),
    heldMs: zero(0),
    bombs: zero(0),
    lives: zero(merged.lives),
    points: zero(0),
    streak: zero(0),
    bestStreak: zero(0),
    history: [],
  };
  // Na primeira rodada quem começa é sorteado — não é o host, para não virar vantagem.
  base.activeId = pick(players, rng).id;
  drawRound(base, rng);
  return base;
}

/** Sorteia o que a rodada precisa: um desafio no clássico, um tema com letras no Alfabeto. */
function drawRound(state: BombState, rng: () => number): void {
  if (state.settings.variant === 'alfabeto') {
    const { theme, round } = startAlphabetRound(state.settings, new Set(state.usedChallengeIds), rng);
    state.alphabet = round;
    state.challenge = null;
    if (!state.usedChallengeIds.includes(theme.id)) state.usedChallengeIds.push(theme.id);
    return;
  }
  const challenge = pickChallenge(state.settings, new Set(state.usedChallengeIds), rng);
  state.challenge = challenge;
  state.alphabet = null;
  if (!state.usedChallengeIds.includes(challenge.id)) state.usedChallengeIds.push(challenge.id);
}

/** "Estou pronto": acende o pavio. É só aqui que a bomba passa a contar. */
export function armBomb(state: BombState, now: number, rng: () => number = Math.random): BombState {
  if (state.phase !== 'handoff') return state;
  const fuse = drawFuse(state.settings, rng);
  return {
    ...state,
    phase: 'armed',
    explodeAt: now + fuse,
    heldSince: now,
    pendingAlarms: drawFakeAlarms(now, fuse, rng),
  };
}

/**
 * "Passar bomba". A responsabilidade muda no toque, não na entrega física (§19) — é o que evita
 * a discussão de "explodiu enquanto eu passava". O pavio **não** reinicia (§18).
 */
export function passBomb(state: BombState, now: number, rng: () => number = Math.random): BombState {
  if (state.phase !== 'armed') return state;
  const held = state.heldSince === null ? 0 : now - state.heldSince;
  return {
    ...state,
    activeId: nextPlayerId(state, rng),
    heldSince: now,
    passes: { ...state.passes, [state.activeId]: (state.passes[state.activeId] ?? 0) + 1 },
    heldMs: { ...state.heldMs, [state.activeId]: (state.heldMs[state.activeId] ?? 0) + held },
    points: state.settings.mode === 'pontos' ? { ...state.points, [state.activeId]: (state.points[state.activeId] ?? 0) + BOMB_RULES.points.pass } : state.points,
  };
}

/**
 * Alfabeto: toca a letra, que é o mesmo que passar a bomba (§6). Recusa em silêncio o que não
 * pode ser tocado — letra de fora do tema, já usada, ou bomba apagada — porque um toque inválido
 * no meio da pressa não deveria punir ninguém.
 *
 * Gastar a última letra **desarma** a bomba: ninguém perde a rodada (§29).
 */
export function useLetter(state: BombState, letter: string, now: number, rng: () => number = Math.random): BombState {
  if (!canUseLetter(state, letter)) return state;
  const letra = letter.toUpperCase();
  const held = state.heldSince === null ? 0 : now - state.heldSince;
  const round = state.alphabet!;

  const usado = {
    ...state,
    alphabet: { ...round, used: [...round.used, { letter: letra, playerId: state.activeId, ms: held }] },
    passes: { ...state.passes, [state.activeId]: (state.passes[state.activeId] ?? 0) + 1 },
    heldMs: { ...state.heldMs, [state.activeId]: (state.heldMs[state.activeId] ?? 0) + held },
    points:
      state.settings.mode === 'pontos'
        ? { ...state.points, [state.activeId]: (state.points[state.activeId] ?? 0) + ALPHABET_RULES.points.letter }
        : state.points,
  };

  if (remainingLetters(usado).length === 0) return disarm(usado);
  return { ...usado, activeId: nextPlayerId(usado, rng), heldSince: now };
}

/** O grupo gastou o alfabeto inteiro antes de a bomba estourar: vitória de todos (§30). */
function disarm(state: BombState): BombState {
  const vivos = activePlayers(state);
  const points = { ...state.points };
  if (state.settings.mode === 'pontos') {
    for (const p of vivos) points[p.id] = (points[p.id] ?? 0) + ALPHABET_RULES.points.disarm;
  }
  const streak = { ...state.streak };
  const bestStreak = { ...state.bestStreak };
  // Ninguém explodiu: a sequência de todo mundo continua.
  for (const p of vivos) {
    streak[p.id] = (streak[p.id] ?? 0) + 1;
    bestStreak[p.id] = Math.max(bestStreak[p.id] ?? 0, streak[p.id]);
  }
  return {
    ...state,
    phase: 'disarmed',
    explodeAt: null,
    heldSince: null,
    pendingAlarms: [],
    loserId: null,
    points,
    streak,
    bestStreak,
    history: [...state.history, { round: state.roundIndex, challengeId: state.alphabet?.themeId ?? '', challenge: state.alphabet?.name ?? '', loserId: '', disarmed: true }],
  };
}

/**
 * Passa o relógio. Chamado pela tela a cada quadro; devolve o mesmo objeto quando nada mudou,
 * para não provocar render à toa.
 */
export function bombTick(state: BombState, now: number): BombState {
  if (state.phase !== 'armed' || state.explodeAt === null) return state;
  if (now >= state.explodeAt) return explode(state, now);

  const disparados = state.pendingAlarms.filter((at) => now >= at);
  if (disparados.length === 0) return state;
  return {
    ...state,
    pendingAlarms: state.pendingAlarms.filter((at) => now < at),
    alarmCount: state.alarmCount + disparados.length,
  };
}

function explode(state: BombState, now: number): BombState {
  const loserId = state.activeId;
  const held = state.heldSince === null ? 0 : now - state.heldSince;
  const vivos = activePlayers(state);

  const lives = { ...state.lives };
  const eliminated = [...state.eliminated];
  if (state.settings.mode === 'eliminacao') {
    lives[loserId] = Math.max(0, (lives[loserId] ?? state.settings.lives) - 1);
    if (lives[loserId] === 0) eliminated.push(loserId);
  }

  const points = { ...state.points };
  if (state.settings.mode === 'pontos') {
    // Sobreviver à rodada vale para todo mundo, menos quem estava com a bomba.
    for (const p of vivos) if (p.id !== loserId) points[p.id] = (points[p.id] ?? 0) + BOMB_RULES.points.survive;
  }

  const streak = { ...state.streak };
  const bestStreak = { ...state.bestStreak };
  for (const p of vivos) {
    streak[p.id] = p.id === loserId ? 0 : (streak[p.id] ?? 0) + 1;
    bestStreak[p.id] = Math.max(bestStreak[p.id] ?? 0, streak[p.id]);
  }

  return {
    ...state,
    phase: 'exploded',
    explodeAt: null,
    heldSince: null,
    pendingAlarms: [],
    loserId,
    lives,
    eliminated,
    points,
    streak,
    bestStreak,
    heldMs: { ...state.heldMs, [loserId]: (state.heldMs[loserId] ?? 0) + held },
    bombs: { ...state.bombs, [loserId]: (state.bombs[loserId] ?? 0) + 1 },
    history: [
      ...state.history,
      {
        round: state.roundIndex,
        challengeId: state.challenge?.id ?? state.alphabet?.themeId ?? '',
        challenge: state.challenge?.text ?? state.alphabet?.name ?? '',
        loserId,
      },
    ],
  };
}

/** A partida acabou? Por rodadas cumpridas, ou por sobrar uma pessoa no modo eliminação. */
export function isOver(state: BombState): boolean {
  if (state.settings.mode === 'eliminacao') return activePlayers(state).length <= 1;
  return state.settings.totalRounds > 0 && state.roundIndex >= state.settings.totalRounds;
}

/** Próxima rodada: novo desafio, novo pavio, e quem começa segue a configuração (§30). */
export function nextRound(state: BombState, rng: () => number = Math.random): BombState {
  if (state.phase !== 'exploded' && state.phase !== 'disarmed') return state;
  if (isOver(state)) return { ...state, phase: 'finished' };

  const vivos = activePlayers(state);
  const perdedorSegue = state.settings.startsNext === 'perdedor' && state.loserId !== null && vivos.some((p) => p.id === state.loserId);
  const proximo: BombState = {
    ...state,
    phase: 'handoff',
    roundIndex: state.roundIndex + 1,
    // Sem perdedor (rodada desarmada), o sorteio decide quem abre a próxima.
    activeId: perdedorSegue ? state.loserId! : pick(vivos, rng).id,
    loserId: null,
    alarmCount: 0,
  };
  drawRound(proximo, rng);
  return proximo;
}

/** Encerra uma partida sem limite de rodadas. */
export const endMatch = (state: BombState): BombState => ({ ...state, phase: 'finished' });

/** Classificação final. Menos bombas é melhor; no modo pontos, mais pontos é melhor. */
export function standings(state: BombState): BombStanding[] {
  const ordenados = [...state.players]
    .map((p) => ({
      playerId: p.id,
      bombs: state.bombs[p.id] ?? 0,
      points: state.points[p.id] ?? 0,
      lives: state.lives[p.id] ?? 0,
      eliminated: state.eliminated.includes(p.id),
    }))
    .sort((a, b) => {
      if (state.settings.mode === 'pontos') return b.points - a.points;
      // Eliminação: quem sobreviveu vem antes, e entre eliminados quem caiu por último.
      if (state.settings.mode === 'eliminacao' && a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      return a.bombs - b.bombs;
    });
  const chave = (s: (typeof ordenados)[number]) => (state.settings.mode === 'pontos' ? -s.points : s.bombs);
  // Colocação "de competição": quem empata divide a posição, e a seguinte é pulada (1, 1, 3).
  return ordenados.map((s) => ({ ...s, position: 1 + ordenados.filter((o) => chave(o) < chave(s)).length }));
}

/** Os destaques do fim (§50). Só entram os que têm base — ninguém vira "mão rápida" com zero passagens. */
export function highlights(state: BombState): BombHighlight[] {
  const out: BombHighlight[] = [];
  const nome = (id: string) => state.players.find((p) => p.id === id)?.name ?? '—';
  const media = (id: string) => (state.passes[id] ? state.heldMs[id] / state.passes[id] : Infinity);
  const comPassagens = state.players.filter((p) => (state.passes[p.id] ?? 0) > 0);
  const segundos = (ms: number) => `${(ms / 1000).toFixed(1)}s em média`;

  const frio = [...state.players].sort((a, b) => (state.passes[b.id] ?? 0) - (state.passes[a.id] ?? 0))[0];
  // No Alfabeto quem mais passou é o "mestre do alfabeto"; dois prêmios para o mesmo número não dizem nada.
  if (state.settings.variant !== 'alfabeto' && frio && (state.passes[frio.id] ?? 0) > 0) {
    out.push({ key: 'frio', emoji: '🧊', title: 'Sangue frio', playerId: frio.id, value: `Passou a bomba ${state.passes[frio.id]}×` });
  }

  const ima = [...state.players].sort((a, b) => (state.bombs[b.id] ?? 0) - (state.bombs[a.id] ?? 0))[0];
  if (ima && (state.bombs[ima.id] ?? 0) > 1) {
    out.push({ key: 'ima', emoji: '💀', title: 'Ímã de bomba', playerId: ima.id, value: `A bomba estourou ${state.bombs[ima.id]}× na mão dele` });
  }

  if (comPassagens.length > 1) {
    const rapido = [...comPassagens].sort((a, b) => media(a.id) - media(b.id))[0];
    const pensador = [...comPassagens].sort((a, b) => media(b.id) - media(a.id))[0];
    out.push({ key: 'rapido', emoji: '⚡', title: 'Mão rápida', playerId: rapido.id, value: segundos(media(rapido.id)) });
    // Só vale destacar o oposto quando os dois tempos são de fato diferentes; com valores
    // parecidos seriam dois prêmios para o mesmo número, e o rótulo perderia o sentido.
    const separados = media(pensador.id) >= media(rapido.id) * 1.5 && media(pensador.id) - media(rapido.id) >= 700;
    if (pensador.id !== rapido.id && separados) {
      out.push({ key: 'pensador', emoji: '🐢', title: 'Pensador', playerId: pensador.id, value: segundos(media(pensador.id)) });
    }
  }

  if (state.settings.variant === 'alfabeto') {
    // No Alfabeto, "passagem" é letra gasta: quem mais destravou o grupo merece o nome.
    const mestre = [...state.players].sort((a, b) => (state.passes[b.id] ?? 0) - (state.passes[a.id] ?? 0))[0];
    if (mestre && (state.passes[mestre.id] ?? 0) > 0) {
      out.push({ key: 'alfabeto', emoji: '🔤', title: 'Mestre do alfabeto', playerId: mestre.id, value: `Gastou ${state.passes[mestre.id]} letras` });
    }
  }

  const sobrevivente = [...state.players].sort((a, b) => (state.bestStreak[b.id] ?? 0) - (state.bestStreak[a.id] ?? 0))[0];
  if (sobrevivente && (state.bestStreak[sobrevivente.id] ?? 0) > 1) {
    out.push({ key: 'sobrevivente', emoji: '🔥', title: 'Sobrevivente', playerId: sobrevivente.id, value: `${state.bestStreak[sobrevivente.id]} rodadas sem explodir` });
  }
  return out;
}

/** Normaliza o que veio da tela: categoria desconhecida some e as listas nunca ficam vazias. */
export function sanitizeBombSettings(input: Partial<BombSettings> | undefined): BombSettings {
  // Cada variante tem faixa de tempo e nº de rodadas próprios; o padrão certo depende dela.
  const padrao = input?.variant === 'alfabeto' ? DEFAULT_ALPHABET_SETTINGS : DEFAULT_BOMB_SETTINGS;
  const base = { ...padrao, ...input };
  const validas: readonly string[] = base.variant === 'alfabeto' ? ALPHABET_CATEGORIES : BOMB_CATEGORIES;
  const categories = base.categories.filter((c) => validas.includes(c));
  const difficulties = (['facil', 'medio', 'dificil'] as const).filter((d) => base.difficulties.includes(d));
  const min = Math.min(Math.max(5, base.minSeconds), 300);
  return {
    ...base,
    categories,
    difficulties: difficulties.length ? difficulties : padrao.difficulties,
    letterSet: base.letterSet === 'hardcore' ? 'hardcore' : 'normal',
    lives: Math.min(Math.max(1, Math.round(base.lives)), 5),
    totalRounds: Math.min(Math.max(0, Math.round(base.totalRounds)), 50),
    minSeconds: min,
    maxSeconds: Math.min(Math.max(min, base.maxSeconds), 300),
  };
}

import type { PlayerId } from '../types';

import { EMPTY_WHOAMI_CONTENT, hintsOf, matchesIdentity, type WhoamiContent } from './whoami-content';
import { IDENTITIES } from './whoami-identities';
import {
  DEFAULT_WHOAMI_SETTINGS,
  WHOAMI_CATEGORIES,
  WHOAMI_HINTS,
  WHOAMI_POINTS,
  WHOAMI_PRESETS,
  type Identity,
  type WhoamiDifficulty,
  type WhoamiPlayerRound,
  type WhoamiReveal,
  type WhoamiSettings,
  type WhoamiStanding,
  type WhoamiSummary,
  type WhoamiTitle,
} from './whoami-types';

export * from './whoami-content';
export * from './whoami-types';

/**
 * Quem Sou Eu?: regras puras, sem I/O e sem timers.
 *
 * A inversão que define o jogo: **o segredo de cada um é público para todos os outros.** No
 * Impostor, o papel é meu e só meu. Aqui a minha identidade é a única coisa que eu não posso ver,
 * e todo mundo vê. Isso significa que o filtro do snapshot roda ao contrário do habitual, e é a
 * razão de `viewFor` precisar de teste próprio: um vazamento aqui não é desvantagem, é o fim do
 * jogo para aquele jogador.
 *
 * ## Duas decisões de produto que moldam este arquivo
 *
 * **As respostas são faladas.** O grupo responde "sim/não/talvez" em voz alta, como numa mesa de
 * verdade — o app não coleta voto por pergunta. É a mesma escolha do Impostor, em que as pistas
 * são faladas e o app só conta o tempo. Consequência técnica: não existe estado de pergunta, e o
 * turno é só "de quem é a vez". Consequência de produto: o jogo não sabe quantas perguntas alguém
 * fez, então o título de "detetive" (§27) mede outra coisa — quem descobriu sem pedir dica.
 *
 * **Uma tentativa por turno** (§13, a alternativa que a própria spec recomenda para o competitivo).
 * Chutar custa a vez, então chutar é decisão, não reflexo.
 */

export const WHOAMI_RULES = {
  /** Abaixo de três não há jogo: com dois, cada um só tem uma pessoa para perguntar. */
  minPlayers: 3,
  recommendedPlayers: 6,
  maxPlayers: 12,
  hints: WHOAMI_HINTS,
} as const;

/* ───────────────────────────── sorteio ───────────────────────────── */

function shuffle<T>(lista: T[], rng: () => number): T[] {
  const out = [...lista];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const serve = (i: Identity, s: WhoamiSettings): boolean =>
  (s.categories.length === 0 || s.categories.includes(i.category)) && s.difficulties.includes(i.difficulty);

/** O baralho da partida: o banco local mais o que foi gerado para este grupo. */
const deckDe = (content: WhoamiContent): Identity[] => (content.identities.length ? [...IDENTITIES, ...content.identities] : IDENTITIES);

/** Quantas identidades existem para uma configuração. É o que a tela de preparação mostra. */
export const countIdentities = (settings: WhoamiSettings, content: WhoamiContent = EMPTY_WHOAMI_CONTENT): number =>
  deckDe(content).filter((i) => serve(i, settings)).length;

/**
 * Sorteia `count` identidades DIFERENTES, com três níveis de preferência.
 *
 * 1. Nunca vista: nem nesta partida, nem em partidas anteriores deste grupo.
 * 2. Não usada nesta partida, mas já vista em outro dia.
 * 3. Qualquer uma — só quando o baralho acabou, porque rodada sem identidade não existe.
 *
 * Se a configuração do grupo tem menos identidades do que jogadores, o baralho inteiro entra: é
 * melhor fugir do filtro escolhido do que deixar alguém sem identidade.
 */
export function pickIdentities(
  settings: WhoamiSettings,
  count: number,
  usedIds: Set<string>,
  rng: () => number,
  content: WhoamiContent = EMPTY_WHOAMI_CONTENT,
): Identity[] {
  const deck = deckDe(content);
  const elegiveis = deck.filter((i) => serve(i, settings));
  const pool = elegiveis.length >= count ? elegiveis : deck;
  const vistos = new Set(content.seenIds);

  const ineditas = shuffle(
    pool.filter((i) => !usedIds.has(i.id) && !vistos.has(i.id)),
    rng,
  );
  const jaVistas = shuffle(
    pool.filter((i) => !usedIds.has(i.id) && vistos.has(i.id)),
    rng,
  );
  const usadas = shuffle(
    pool.filter((i) => usedIds.has(i.id)),
    rng,
  );
  return [...ineditas, ...jaVistas, ...usadas].slice(0, count);
}

/* ───────────────────────────── estado ───────────────────────────── */

/** O que cada jogador acumulou NESTA rodada. */
export type WhoamiTurnState = {
  hintsUsed: number;
  misses: number;
  /** Instante em que descobriu; `null` enquanto não descobriu. */
  foundAt: number | null;
};

export type WhoamiState = {
  settings: WhoamiSettings;
  content: WhoamiContent;
  /**
   * A identidade de cada jogador nesta rodada, por inteiro.
   *
   * Guarda o objeto completo, e não o id: identidade gerada por IA não está no banco local, então
   * uma sala restaurada em outro processo não teria onde procurar.
   */
  assigned: Record<PlayerId, Identity>;
  /** Ids já usados na PARTIDA: nenhuma identidade se repete entre rodadas. */
  usedIdentityIds: string[];
  /** A ordem dos turnos desta rodada. */
  order: PlayerId[];
  turnIndex: number;
  /** Prazo do turno; `null` quando o grupo joga sem limite. */
  turnEndsAt: number | null;
  /** Prazo da rodada; `null` quando não há limite. */
  roundEndsAt: number | null;
  round: Record<PlayerId, WhoamiTurnState>;
  /** Quem descobriu nesta rodada, na ordem — o primeiro leva o bônus de velocidade. */
  foundOrder: PlayerId[];
  /** Acumulado da partida. */
  totals: Record<PlayerId, { points: number; found: number; misses: number; hints: number; firsts: number }>;
  /** A revelação do fim da rodada. `null` enquanto a rodada corre. */
  reveal: WhoamiReveal[] | null;
  roundsPlayed: number;
};

/** Normaliza as opções que chegam pela rede: o host manda o que quiser, isto é o que vale. */
/**
 * As opções como chegam pela rede.
 *
 * `difficulties` vem como texto livre porque o campo é compartilhado com os outros jogos — o
 * Desafio Secreto usa 'media' onde este usa 'medio'. Quem valida é o sanitizador, não o tipo.
 */
export type WhoamiSettingsInput = Partial<Omit<WhoamiSettings, 'categories' | 'difficulties'>> & { categories?: string[]; difficulties?: string[] };

export function sanitizeWhoamiSettings(input: WhoamiSettingsInput = {}): WhoamiSettings {
  const base = { ...DEFAULT_WHOAMI_SETTINGS, ...input };
  const categories = [...new Set((input.categories ?? []).filter((c) => (WHOAMI_CATEGORIES as readonly string[]).includes(c)))];
  const difficulties = [...new Set((input.difficulties ?? []).filter((d): d is WhoamiDifficulty => d === 'facil' || d === 'medio' || d === 'dificil'))];
  const turnoOk = [0, 15, 20, 30, 45];
  const rodadaOk = [0, 5, 10, 15];
  return {
    categories,
    difficulties: difficulties.length ? difficulties : DEFAULT_WHOAMI_SETTINGS.difficulties,
    turnSeconds: turnoOk.includes(Number(base.turnSeconds)) ? Number(base.turnSeconds) : DEFAULT_WHOAMI_SETTINGS.turnSeconds,
    roundMinutes: rodadaOk.includes(Number(base.roundMinutes)) ? Number(base.roundMinutes) : DEFAULT_WHOAMI_SETTINGS.roundMinutes,
    hints: base.hints !== false,
  };
}

/** Aplica um preset da §16/§20/§21 sobre as categorias que o grupo escolheu. */
export const applyPreset = (preset: keyof typeof WHOAMI_PRESETS, categories: string[]): WhoamiSettings =>
  sanitizeWhoamiSettings({ ...WHOAMI_PRESETS[preset], categories });

export function createWhoamiState(settings: Partial<WhoamiSettings>, content: WhoamiContent = EMPTY_WHOAMI_CONTENT): WhoamiState {
  return {
    settings: sanitizeWhoamiSettings(settings),
    content,
    assigned: {},
    usedIdentityIds: [],
    order: [],
    turnIndex: 0,
    turnEndsAt: null,
    roundEndsAt: null,
    round: {},
    foundOrder: [],
    totals: {},
    reveal: null,
    roundsPlayed: 0,
  };
}

/* ───────────────────────────── a rodada ───────────────────────────── */

const zeroTotal = () => ({ points: 0, found: 0, misses: 0, hints: 0, firsts: 0 });

/**
 * Distribui as identidades e abre a rodada.
 *
 * Quem começa é sorteado (§7): não é o host, para não virar vantagem de quem criou a sala.
 */
export function startWhoamiRound(s: WhoamiState, players: PlayerId[], now: number, rng: () => number): void {
  const identidades = pickIdentities(s.settings, players.length, new Set(s.usedIdentityIds), rng, s.content);

  s.assigned = {};
  s.round = {};
  s.foundOrder = [];
  s.reveal = null;
  players.forEach((id, i) => {
    const identidade = identidades[i % identidades.length];
    s.assigned[id] = identidade;
    s.round[id] = { hintsUsed: 0, misses: 0, foundAt: null };
    if (!s.usedIdentityIds.includes(identidade.id)) s.usedIdentityIds.push(identidade.id);
    s.totals[id] ??= zeroTotal();
  });

  s.order = shuffle(players, rng);
  s.turnIndex = 0;
  s.turnEndsAt = s.settings.turnSeconds > 0 ? now + s.settings.turnSeconds * 1000 : null;
  s.roundEndsAt = s.settings.roundMinutes > 0 ? now + s.settings.roundMinutes * 60_000 : null;
  s.roundsPlayed += 1;
}

/** De quem é a vez. `null` quando não há ninguém para jogar (rodada acabada). */
export const currentTurn = (s: WhoamiState): PlayerId | null => s.order[s.turnIndex] ?? null;

/** Ainda falta alguém descobrir? É o que decide se a rodada continua. */
export const someoneSearching = (s: WhoamiState): boolean => s.order.some((id) => s.round[id] && s.round[id].foundAt === null);

/**
 * Passa a vez para o próximo que ainda não descobriu.
 *
 * Devolve `false` quando não há mais ninguém procurando — aí quem chamou fecha a rodada. Quem já
 * descobriu continua na sala respondendo às perguntas dos outros, só não recebe mais turno.
 */
export function advanceTurn(s: WhoamiState, now: number): boolean {
  if (!someoneSearching(s)) return false;
  for (let passo = 1; passo <= s.order.length; passo++) {
    const proximo = (s.turnIndex + passo) % s.order.length;
    const id = s.order[proximo];
    if (s.round[id]?.foundAt === null) {
      s.turnIndex = proximo;
      s.turnEndsAt = s.settings.turnSeconds > 0 ? now + s.settings.turnSeconds * 1000 : null;
      return true;
    }
  }
  return false;
}

/** Pede a próxima dica. Não gasta a vez: pedir dica e chutar na mesma rodada é a jogada normal. */
export function takeHint(s: WhoamiState, playerId: PlayerId): string | null {
  if (!s.settings.hints) return null;
  const meu = s.round[playerId];
  if (!meu || meu.foundAt !== null || meu.hintsUsed >= WHOAMI_HINTS) return null;
  const identidade = s.assigned[playerId];
  if (!identidade) return null;
  meu.hintsUsed += 1;
  return hintsOf(identidade)[meu.hintsUsed - 1] ?? null;
}

/** As dicas que este jogador já pagou para ver. */
export const hintsTaken = (s: WhoamiState, playerId: PlayerId): string[] => {
  const identidade = s.assigned[playerId];
  const usadas = s.round[playerId]?.hintsUsed ?? 0;
  return identidade ? hintsOf(identidade).slice(0, usadas) : [];
};

/**
 * Tenta adivinhar. Acerte ou erre, a vez passa — é a regra de uma tentativa por turno.
 *
 * O texto é livre porque **escolher de uma lista quebraria o jogo**: quem vê a identidade de todos
 * os outros descobre a própria por eliminação. A generosidade do casamento (acento, caixa, erro de
 * digitação, aliases) é o que faz o texto livre não virar briga com o app.
 */
export function guessIdentity(s: WhoamiState, playerId: PlayerId, guess: string, now: number): { correct: boolean } {
  const meu = s.round[playerId];
  const identidade = s.assigned[playerId];
  if (!meu || !identidade || meu.foundAt !== null) return { correct: false };

  const correct = matchesIdentity(guess, identidade);
  if (correct) {
    meu.foundAt = now;
    s.foundOrder.push(playerId);
  } else {
    meu.misses += 1;
  }
  advanceTurn(s, now);
  return { correct };
}

/** Pontos da rodada de um jogador, já com dicas, erros e bônus. Prefixado porque o Casal Perfeito já tem um `roundPoints` com outra conta. */
export function whoamiRoundPoints(s: WhoamiState, playerId: PlayerId): number {
  const meu = s.round[playerId];
  if (!meu) return 0;
  // `0 * -10` é `-0` em JavaScript, e `-0` não sobrevive ao JSON nem fica bonito na tela.
  const errosm = meu.misses === 0 ? 0 : meu.misses * WHOAMI_POINTS.wrongAttempt;
  if (meu.foundAt === null) return errosm;
  const base = WHOAMI_POINTS.found[Math.min(meu.hintsUsed, WHOAMI_POINTS.found.length - 1)];
  const bonus = s.foundOrder[0] === playerId ? WHOAMI_POINTS.firstBonus : 0;
  return base + bonus + errosm;
}

/** O resumo da rodada de um jogador, para o histórico e para a tela. */
export const playerRound = (s: WhoamiState, playerId: PlayerId): WhoamiPlayerRound | null => {
  const meu = s.round[playerId];
  const identidade = s.assigned[playerId];
  if (!meu || !identidade) return null;
  return {
    playerId,
    identityId: identidade.id,
    hintsUsed: meu.hintsUsed,
    misses: meu.misses,
    foundAt: meu.foundAt,
    first: s.foundOrder[0] === playerId,
    points: whoamiRoundPoints(s, playerId),
  };
};

/**
 * Fecha a rodada: revela tudo (§26) e soma no acumulado da partida.
 *
 * Idempotente — chamar duas vezes não dobra a pontuação. Importa porque o fim da rodada pode
 * chegar por três caminhos ao mesmo tempo: o último acerto, o prazo da rodada e o host encerrando.
 */
export function closeWhoamiRound(s: WhoamiState): WhoamiReveal[] {
  if (s.reveal) return s.reveal;

  s.reveal = s.order.map((id) => {
    const meu = s.round[id];
    const pontos = whoamiRoundPoints(s, id);
    s.totals[id] ??= zeroTotal();
    const t = s.totals[id];
    t.points += pontos;
    t.misses += meu.misses;
    t.hints += meu.hintsUsed;
    if (meu.foundAt !== null) t.found += 1;
    if (s.foundOrder[0] === id) t.firsts += 1;
    return { playerId: id, identity: s.assigned[id], found: meu.foundAt !== null, hintsUsed: meu.hintsUsed, misses: meu.misses, points: pontos };
  });

  s.turnEndsAt = null;
  s.roundEndsAt = null;
  return s.reveal;
}

/* ───────────────────────────── placar e títulos ───────────────────────────── */

export function whoamiStandings(s: WhoamiState): WhoamiStanding[] {
  const ids = Object.keys(s.totals);
  const ordenado = ids
    .map((playerId) => ({ playerId, ...s.totals[playerId] }))
    .sort((a, b) => b.points - a.points || b.found - a.found || a.misses - b.misses);

  let posicao = 0;
  let anterior: number | null = null;
  return ordenado.map((linha, i) => {
    if (anterior === null || linha.points !== anterior) posicao = i + 1;
    anterior = linha.points;
    return { playerId: linha.playerId, points: linha.points, found: linha.found, misses: linha.misses, position: posicao };
  });
}

/**
 * Os títulos do fim da partida (§27).
 *
 * "Detetive" era, na spec, "quem fez as melhores perguntas". Como as perguntas são faladas, o app
 * não as vê — então aqui ele mede a coisa mais próxima que ele sabe: quem descobriu mais vezes sem
 * pedir dica nenhuma. É honesto chamar isso de detetive; chamar de "melhores perguntas" não seria.
 */
export function whoamiTitles(s: WhoamiState): WhoamiTitle[] {
  const ids = Object.keys(s.totals);
  if (!ids.length) return [];
  const t = (id: PlayerId) => s.totals[id];
  const titulos: WhoamiTitle[] = [];

  const melhor = (valor: (id: PlayerId) => number, minimo = 1): PlayerId | null => {
    const ordenado = [...ids].sort((a, b) => valor(b) - valor(a));
    return ordenado.length && valor(ordenado[0]) >= minimo ? ordenado[0] : null;
  };

  const mestre = melhor((id) => t(id).points, Number.NEGATIVE_INFINITY);
  if (mestre) titulos.push({ key: 'mestre', emoji: '🧠', title: 'Mestre da adivinhação', playerId: mestre, value: `${t(mestre).points} pontos` });

  const semDica = (id: PlayerId) => (t(id).found > 0 && t(id).hints === 0 ? t(id).found : 0);
  const detetive = melhor(semDica);
  if (detetive) titulos.push({ key: 'detetive', emoji: '🔎', title: 'Detetive', playerId: detetive, value: `${t(detetive).found}× sem pedir dica` });

  const chutador = melhor((id) => t(id).misses, 2);
  if (chutador) titulos.push({ key: 'chutador', emoji: '🎲', title: 'Chutador', playerId: chutador, value: `${t(chutador).misses} chutes errados` });

  const rapido = melhor((id) => t(id).firsts);
  if (rapido && rapido !== detetive) titulos.push({ key: 'rapido', emoji: '⚡', title: 'Mente rápida', playerId: rapido, value: `${t(rapido).firsts}× o primeiro` });

  // "Sobreviveu até o fim" (§27): quem mais vezes não conseguiu descobrir. É carinhoso, não cruel.
  const persistente = melhor((id) => s.roundsPlayed - t(id).found, 2);
  if (persistente && persistente !== mestre) {
    titulos.push({ key: 'persistente', emoji: '🐢', title: 'Resistiu até o fim', playerId: persistente, value: `${s.roundsPlayed - t(persistente).found} rodadas no escuro` });
  }

  return titulos;
}

export const whoamiSummary = (s: WhoamiState): WhoamiSummary => ({ standings: whoamiStandings(s), titles: whoamiTitles(s), rounds: s.roundsPlayed });

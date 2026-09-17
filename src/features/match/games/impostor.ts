import type { Player, PlayerId, RoundResult, TallyEntry } from '../domain/types';

/**
 * Regras puras do Impostor (sem I/O, sem timers) — reutilizáveis pelo mock hoje
 * e por uma edge function/servidor amanhã. Jogos novos ganham um módulo irmão deste.
 */

type Word = { word: string; emoji: string };

const WORD_BANK: Record<string, Word[]> = {
  Comidas: [
    { word: 'Pizza', emoji: '🍕' },
    { word: 'Sushi', emoji: '🍣' },
    { word: 'Brigadeiro', emoji: '🍫' },
    { word: 'Churrasco', emoji: '🥩' },
    { word: 'Pastel', emoji: '🥟' },
    { word: 'Açaí', emoji: '🍇' },
    { word: 'Coxinha', emoji: '🍗' },
    { word: 'Feijoada', emoji: '🍲' },
    { word: 'Sorvete', emoji: '🍦' },
    { word: 'Pipoca', emoji: '🍿' },
  ],
  Filmes: [
    { word: 'Titanic', emoji: '🚢' },
    { word: 'Shrek', emoji: '🧅' },
    { word: 'Matrix', emoji: '🕶️' },
    { word: 'Rei Leão', emoji: '🦁' },
    { word: 'Tropa de Elite', emoji: '🚔' },
    { word: 'Harry Potter', emoji: '🧙' },
    { word: 'Procurando Nemo', emoji: '🐠' },
    { word: 'Vingadores', emoji: '🦸' },
    { word: 'Cidade de Deus', emoji: '🎥' },
    { word: 'Jurassic Park', emoji: '🦖' },
  ],
  Futebol: [
    { word: 'Pênalti', emoji: '🥅' },
    { word: 'Goleiro', emoji: '🧤' },
    { word: 'Maracanã', emoji: '🏟️' },
    { word: 'Escanteio', emoji: '🚩' },
    { word: 'Cartão vermelho', emoji: '🟥' },
    { word: 'Copa do Mundo', emoji: '🏆' },
    { word: 'Impedimento', emoji: '🙅' },
    { word: 'Bicicleta', emoji: '🚲' },
    { word: 'Técnico', emoji: '📋' },
    { word: 'Torcida', emoji: '📣' },
  ],
  Lugares: [
    { word: 'Praia', emoji: '🏖️' },
    { word: 'Paris', emoji: '🗼' },
    { word: 'Shopping', emoji: '🛍️' },
    { word: 'Aeroporto', emoji: '✈️' },
    { word: 'Academia', emoji: '🏋️' },
    { word: 'Cinema', emoji: '🎦' },
    { word: 'Hospital', emoji: '🏥' },
    { word: 'Cristo Redentor', emoji: '⛰️' },
    { word: 'Fazenda', emoji: '🐄' },
    { word: 'Escola', emoji: '🏫' },
  ],
};

export const IMPOSTOR_RULES = {
  minPlayers: 3,
  roundSeconds: 60,
  points: { groupCatches: 200, impostorEscapes: 300, correctVoteBonus: 50 },
} as const;

const pick = <T,>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)];

export function shuffle<T>(list: T[], rng: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type ImpostorRound = { word: Word; category: string; impostorId: PlayerId; order: PlayerId[] };

export function createImpostorRound(
  players: Player[],
  category: string,
  usedWords: Set<string>,
  rng: () => number = Math.random,
): ImpostorRound {
  const resolved = WORD_BANK[category] ? category : pick(Object.keys(WORD_BANK), rng);
  const bank = WORD_BANK[resolved];
  const fresh = bank.filter((w) => !usedWords.has(w.word));
  const word = pick(fresh.length ? fresh : bank, rng);
  return {
    word,
    category: resolved,
    impostorId: pick(players, rng).id,
    order: shuffle(players.map((p) => p.id), rng),
  };
}

/** Apura os votos e calcula os pontos da rodada. */
export function resolveImpostorRound(
  round: ImpostorRound,
  votes: Record<PlayerId, PlayerId>,
  players: Player[],
): Omit<RoundResult, 'stage'> {
  const counts = new Map<PlayerId, number>();
  Object.values(votes).forEach((target) => counts.set(target, (counts.get(target) ?? 0) + 1));
  const tally: TallyEntry[] = [...counts.entries()]
    .map(([playerId, n]) => ({ playerId, votes: n }))
    .sort((a, b) => b.votes - a.votes);

  const top = tally[0];
  const tiedAtTop = tally.filter((t) => t.votes === top.votes);
  // Empate no topo nunca condena o impostor: o escolhido é outro dos empatados.
  const chosenId = tiedAtTop.length > 1 ? (tiedAtTop.find((t) => t.playerId !== round.impostorId) ?? top).playerId : top.playerId;
  const caught = chosenId === round.impostorId;

  const { groupCatches, impostorEscapes, correctVoteBonus } = IMPOSTOR_RULES.points;
  const pointsDelta: Record<PlayerId, number> = {};
  for (const p of players) {
    const isImpostor = p.id === round.impostorId;
    let delta = 0;
    if (caught && !isImpostor) delta += groupCatches;
    if (!caught && isImpostor) delta += impostorEscapes;
    if (!isImpostor && votes[p.id] === round.impostorId) delta += correctVoteBonus;
    pointsDelta[p.id] = delta;
  }

  return {
    chosenId,
    impostorId: round.impostorId,
    caught,
    word: round.word.word,
    tally,
    pointsDelta,
    headline: caught ? { points: groupCatches, target: 'group' } : { points: impostorEscapes, target: round.impostorId },
  };
}

/** Voto de um bot: tende a acertar o impostor, mas erra o bastante para ter graça. */
export function botVote(voterId: PlayerId, round: ImpostorRound, players: Player[], rng: () => number = Math.random): PlayerId {
  const others = players.filter((p) => p.id !== voterId);
  if (voterId !== round.impostorId && rng() < 0.55) return round.impostorId;
  return pick(others, rng).id;
}

import type { Player, PlayerId } from '../types';

import { QUESTIONS } from './likely-questions';
import { DEFAULT_LIKELY_SETTINGS, type LikelyIntensity, type LikelyQuestion, type LikelyRoundResult, type LikelySettings, type LikelyTally } from './likely-types';

export * from './likely-types';

/**
 * Regras puras do "Quem é Mais Provável?" (sem I/O, sem timers), irmão de `impostor.ts`.
 *
 * A diferença de fundo para o Impostor: aqui não existe resposta certa cadastrada. O resultado é
 * o que o GRUPO decidiu, e por isso empate é resultado válido — nunca há desempate automático.
 */

export const LIKELY_RULES = {
  minPlayers: 3,
  /** Acima disso a votação e a discussão ficam lentas demais (spec §3). */
  maxPlayers: 20,
  points: {
    /** Acertou em quem o grupo escolheu. */
    majority: 100,
    /** Extra por participar de uma unanimidade. */
    unanimous: 50,
  },
} as const;

/** Categorias que o banco cobre, na ordem em que aparecem na tela. */
export const LIKELY_CATEGORIES = ['Engraçado', 'Exposed', 'Caos', 'Relacionamentos', 'Festa', 'Trabalho', 'Família', 'Futebol'] as const;

export const LIKELY_INTENSITIES: LikelyIntensity[] = ['leve', 'moderado', 'pesado'];

/** Quantas perguntas existem para uma configuração — é o teto de rodadas sem repetir. */
export function countQuestions(settings: LikelySettings): number {
  return QUESTIONS.filter((q) => matches(q, settings)).length;
}

function matches(question: LikelyQuestion, settings: LikelySettings): boolean {
  const categoryOk = settings.categories.length === 0 || settings.categories.includes(question.category);
  return categoryOk && settings.intensities.includes(question.intensity);
}

/**
 * Sorteia a pergunta da rodada. `usedIds` são as já feitas nesta partida: uma pergunta nunca
 * se repete (spec §27). Se o baralho acabar, ele é reembaralhado em vez de travar a partida.
 */
export function pickLikelyQuestion(settings: LikelySettings, usedIds: Set<string>, rng: () => number = Math.random): LikelyQuestion {
  const elegiveis = QUESTIONS.filter((q) => matches(q, settings));
  // Configuração impossível (categoria sem pergunta na intensidade pedida): cai no baralho inteiro
  // em vez de deixar a sala sem rodada.
  const baralho = elegiveis.length ? elegiveis : QUESTIONS;
  const novas = baralho.filter((q) => !usedIds.has(q.id));
  const fonte = novas.length ? novas : baralho;
  return fonte[Math.floor(rng() * fonte.length)];
}

/** Quem pode receber voto nesta rodada. Quem entrou no meio da partida já conta (spec §33). */
export function eligibleTargets(players: Player[], voterId: PlayerId, settings: LikelySettings): PlayerId[] {
  return players.filter((p) => settings.allowSelfVote || p.id !== voterId).map((p) => p.id);
}

/**
 * Apura a pergunta. `eligible` é quem podia votar; quem não votou simplesmente não entra na conta
 * (spec §13: sem voto automático).
 */
export function resolveLikelyRound(votes: Record<PlayerId, PlayerId>, eligible: PlayerId[], settings: LikelySettings): LikelyRoundResult {
  const voters = Object.keys(votes);
  const porAlvo = new Map<PlayerId, PlayerId[]>();
  for (const [voterId, targetId] of Object.entries(votes)) porAlvo.set(targetId, [...(porAlvo.get(targetId) ?? []), voterId]);

  const tally: LikelyTally[] = [...porAlvo.entries()]
    .map(([playerId, voterIds]) => ({ playerId, votes: voterIds.length, voterIds: settings.openVotes ? voterIds.sort() : [] }))
    .sort((a, b) => b.votes - a.votes || a.playerId.localeCompare(b.playerId));

  const maxVotes = tally[0]?.votes ?? 0;
  // Todos com a maior contagem vencem a pergunta — inclusive em empate (spec §17 e §38).
  const winnerIds = tally.filter((t) => t.votes === maxVotes).map((t) => t.playerId);

  // Unanimidade exige que TODO MUNDO que podia votar tenha votado, e na mesma pessoa:
  // 4 votos iguais entre 7 pessoas não é o grupo inteiro concordando.
  const unanimous = winnerIds.length === 1 && voters.length === eligible.length && voters.length > 0 && maxVotes === voters.length;
  const selfConfirmed = unanimous && votes[winnerIds[0]] === winnerIds[0];

  const pointsDelta: Record<PlayerId, number> = {};
  if (settings.competitive) {
    const { majority, unanimous: bonus } = LIKELY_RULES.points;
    for (const voterId of eligible) {
      const voto = votes[voterId];
      // Em empate, votar em qualquer um dos empatados vale os pontos (spec §19).
      const acertou = voto !== undefined && winnerIds.includes(voto);
      pointsDelta[voterId] = acertou ? majority + (unanimous ? bonus : 0) : 0;
    }
  }

  return { winnerIds, tally, totalVotes: voters.length, eligibleCount: eligible.length, unanimous, selfConfirmed, pointsDelta };
}

/** Voto de um bot: escolhe qualquer elegível, sem tender a ninguém — o jogo não tem resposta certa. */
export function botLikelyVote(voterId: PlayerId, players: Player[], settings: LikelySettings, rng: () => number = Math.random): PlayerId {
  const alvos = eligibleTargets(players, voterId, settings);
  return alvos[Math.floor(rng() * alvos.length)];
}

/** Normaliza o que veio do app: categoria desconhecida é ignorada, e a lista nunca fica vazia. */
export function sanitizeSettings(input: Partial<LikelySettings> | undefined): LikelySettings {
  const base = { ...DEFAULT_LIKELY_SETTINGS, ...input };
  const categories = base.categories.filter((c) => (LIKELY_CATEGORIES as readonly string[]).includes(c));
  const intensities = LIKELY_INTENSITIES.filter((i) => base.intensities.includes(i));
  return {
    categories,
    intensities: intensities.length ? intensities : DEFAULT_LIKELY_SETTINGS.intensities,
    allowSelfVote: Boolean(base.allowSelfVote),
    openVotes: Boolean(base.openVotes),
    competitive: Boolean(base.competitive),
  };
}

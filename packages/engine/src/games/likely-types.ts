import type { PlayerId } from '../types';

/**
 * Tipos do "Quem é Mais Provável?". Separados de `likely.ts` porque o banco de perguntas
 * (`likely-questions.ts`, 200 linhas de conteúdo) importa daqui sem puxar as regras junto.
 */

/** 🟢 leve: qualquer grupo · 🟡 moderado: provoca · 🔴 pesado: pede intimidade, e é opt-in. */
export type LikelyIntensity = 'leve' | 'moderado' | 'pesado';

/**
 * O app sempre mostra "Quem é mais provável de..." antes; `text` é só a continuação,
 * em minúscula e terminando em "?". O `id` é estável: é ele que evita repetir na mesma partida.
 */
export type LikelyQuestion = {
  id: string;
  category: string;
  intensity: LikelyIntensity;
  text: string;
};

/** O que o host escolhe ao criar a sala. Tudo tem padrão; nada é obrigatório. */
export type LikelySettings = {
  /** Vazio = todas as categorias ("Aleatório"). */
  categories: string[];
  /** `pesado` só entra se o host marcar: conteúdo mais pessoal é opt-in. */
  intensities: LikelyIntensity[];
  /** Votar em si mesmo é permitido por padrão — é parte da graça. */
  allowSelfVote: boolean;
  /** Aberto (padrão): mostra quem votou em quem depois do resultado. Secreto: só a contagem. */
  openVotes: boolean;
  /** Casual (padrão): sem pontos. Competitivo: acerta a maioria, pontua. */
  competitive: boolean;
};

export const DEFAULT_LIKELY_SETTINGS: LikelySettings = {
  categories: [],
  intensities: ['leve', 'moderado'],
  allowSelfVote: true,
  openVotes: true,
  competitive: false,
};

/** Uma linha do placar da pergunta. `voterIds` só é preenchido no modo aberto. */
export type LikelyTally = { playerId: PlayerId; votes: number; voterIds: PlayerId[] };

export type LikelyRoundResult = {
  /** Empate é resultado válido: vários vencedores, sem desempate automático. */
  winnerIds: PlayerId[];
  tally: LikelyTally[];
  /** Quantos votaram de fato (quem não votou não conta). */
  totalVotes: number;
  /** Quantos podiam votar — é o "4 de 7" da revelação. */
  eligibleCount: number;
  /** Todo mundo que votou escolheu a mesma pessoa. */
  unanimous: boolean;
  /** Unanimidade em que o próprio escolhido votou nele mesmo: "nem ele conseguiu negar". */
  selfConfirmed: boolean;
  /** Vazio no modo casual. */
  pointsDelta: Record<PlayerId, number>;
};

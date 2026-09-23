/**
 * Tipos da Bomba-Relógio. Separados de `bomb.ts` porque o banco de desafios
 * (`bomb-challenges.ts`, 180 linhas de conteúdo) importa daqui sem puxar as regras junto.
 */

export type BombDifficulty = 'facil' | 'medio' | 'dificil';

/** Quantas respostas o desafio comporta: `alto` = dezenas · `medio` = ~15 · `baixo` = menos de 10. */
export type BombPool = 'alto' | 'medio' | 'baixo';

/** O `text` é a frase inteira, lida em voz alta: "Diga uma marca de carro." */
export type BombChallenge = {
  id: string;
  category: string;
  difficulty: BombDifficulty;
  pool: BombPool;
  text: string;
};

import type { AlphabetRound } from './alphabet-types';

export * from './alphabet-types';

/** Jogador local: só nome e cor, sem conta. O jogo roda inteiro num aparelho só. */
export type BombPlayer = { id: string; name: string; color: string };

export type BombMode =
  /** Padrão: sem eliminação, cada explosão é uma bomba no nome de quem segurava. */
  | 'casual'
  /** Vidas; quem zera sai, e a partida vai até sobrar uma pessoa. */
  | 'eliminacao'
  /** Pontos por passagem e por sobreviver à rodada. */
  | 'pontos';

/**
 * `classico`: um desafio ("Diga uma marca de carro") e um botão de passar.
 * `alfabeto`: um tema e uma grade de letras — tocar a letra é o que passa a bomba, e cada
 * letra só serve uma vez, então a rodada aperta sozinha conforme elas somem.
 */
export type BombVariant = 'classico' | 'alfabeto';

export type BombSettings = {
  variant: BombVariant;
  /** Vazio = todas as categorias. */
  categories: string[];
  difficulties: BombDifficulty[];
  /** `0` = sem limite: a partida vai até o grupo parar. */
  totalRounds: number;
  mode: BombMode;
  /** Só no modo eliminação. */
  lives: number;
  /** `circular`: a ordem da lista · `caos`: sorteia a cada passagem, sem repetir seguido. */
  order: 'circular' | 'caos';
  /** Quem abre a próxima rodada: quem perdeu (padrão, é uma penalidade a mais) ou sorteio. */
  startsNext: 'perdedor' | 'sorteio';
  /** Faixa do tempo secreto, em segundos. */
  minSeconds: number;
  maxSeconds: number;
  /** Só no Alfabeto. `hardcore`: A–Z inteiro, inclusive as letras que o tema não cobre. */
  letterSet: 'normal' | 'hardcore';
};

export const DEFAULT_BOMB_SETTINGS: BombSettings = {
  variant: 'classico',
  categories: [],
  difficulties: ['facil', 'medio'],
  totalRounds: 10,
  mode: 'casual',
  lives: 3,
  order: 'circular',
  startsNext: 'perdedor',
  minSeconds: 20,
  maxSeconds: 60,
  letterSet: 'normal',
};

/**
 * O Alfabeto respira mais fundo: com as letras sumindo, pensar demora, e um pavio curto viraria
 * sorteio em vez de jogo. A segurança também é maior, para dar tempo de as primeiras letras saírem.
 */
export const DEFAULT_ALPHABET_SETTINGS: BombSettings = {
  ...DEFAULT_BOMB_SETTINGS,
  variant: 'alfabeto',
  totalRounds: 5,
  minSeconds: 30,
  maxSeconds: 90,
};

/**
 * `handoff`: "passe o celular para X", com a bomba ainda apagada — só no começo da rodada.
 * `armed`: bomba correndo. `exploded`: resultado da rodada. `finished`: fim da partida.
 * `disarmed`: só no Alfabeto — o grupo gastou todas as letras antes de estourar e ninguém perdeu.
 */
export type BombPhase = 'handoff' | 'armed' | 'exploded' | 'disarmed' | 'finished';

/** `loserId` vazio numa rodada desarmada: não houve perdedor. */
export type BombRoundLog = { round: number; challengeId: string; challenge: string; loserId: string; disarmed?: boolean };

export type BombState = {
  settings: BombSettings;
  players: BombPlayer[];
  phase: BombPhase;
  roundIndex: number;
  challenge: BombChallenge | null;
  /** O tema e as letras da rodada. Só no Alfabeto; `null` no clássico. */
  alphabet: AlphabetRound | null;
  /** Desafios já usados na partida: nenhum se repete. */
  usedChallengeIds: string[];
  /** Quem está com a bomba AGORA. É ele que perde se ela estourar (§19). */
  activeId: string;
  /**
   * Instante absoluto da explosão, sorteado quando a bomba acende e nunca recalculado.
   * Absoluto de propósito: se o app for para segundo plano, o tempo continua correndo (§45),
   * e não há como ganhar tempo bloqueando a tela.
   */
  explodeAt: number | null;
  /** Desde quando o jogador atual está com a bomba — alimenta "mão rápida" e "pensador". */
  heldSince: number | null;
  /** Falsos alarmes desta rodada que ainda não dispararam, em epoch ms (§38). */
  pendingAlarms: number[];
  /** Sobe a cada susto; a tela usa para disparar a animação uma vez só. */
  alarmCount: number;
  /** Quem levou a explosão da rodada; `null` enquanto ela não aconteceu. */
  loserId: string | null;
  eliminated: string[];

  /* acumulados da partida */
  passes: Record<string, number>;
  heldMs: Record<string, number>;
  bombs: Record<string, number>;
  lives: Record<string, number>;
  points: Record<string, number>;
  /** Rodadas seguidas sem explodir com a pessoa, e o melhor que ela fez. */
  streak: Record<string, number>;
  bestStreak: Record<string, number>;
  history: BombRoundLog[];
};

/** Um destaque do fim da partida. `value` já vem formatado para a tela. */
export type BombHighlight = {
  key: 'frio' | 'ima' | 'rapido' | 'pensador' | 'sobrevivente' | 'alfabeto';
  emoji: string;
  title: string;
  playerId: string;
  value: string;
};

export type BombStanding = { playerId: string; bombs: number; points: number; lives: number; eliminated: boolean; position: number };

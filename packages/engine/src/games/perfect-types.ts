import type { PlayerId } from '../types';

/**
 * Tipos do "Casal Perfeito". Separados de `perfectGame.ts` porque o banco de perguntas
 * (`perfect-questions.ts`) importa daqui sem puxar as regras da sala junto.
 */

export const PERFECT_CATEGORIES = [
  'Dia a dia',
  'Relacionamento',
  'Quem conhece melhor',
  'Nossa história',
  'Viagens',
  'Comida',
  'Dinheiro',
  'Futuro',
  'Casal',
] as const;
export type PerfectCategory = (typeof PERFECT_CATEGORIES)[number];

/**
 * A categoria mais provocativa. Fica de fora do "Misturado" e só entra se o host marcar (§21):
 * um jogo de casais na mesa da família não pode escorregar para esse tom sozinho.
 */
export const SPICY_CATEGORY: PerfectCategory = 'Casal';

/**
 * As quatro mecânicas (§24–31). Todas terminam na mesma pergunta — "os dois marcaram a mesma
 * coisa?" — mas mudam o que cada um vê, e é essa variação que impede a partida de ficar repetitiva.
 *
 * - `who`: quem dos dois. Cada um vê "Eu" e o nome do outro; o servidor compara a PESSOA (§25).
 * - `same`: os dois veem a mesma pergunta e as mesmas opções.
 * - `know`: um responde sobre si, o outro tenta prever. Alterna a cada rodada (§28).
 * - `scale`: de 1 a 5. Aqui existe o quase: diferença de um ponto ainda vale metade (§42).
 */
export type PerfectQuestionType = 'who' | 'same' | 'know' | 'scale';

export type PerfectOption = { id: string; emoji: string; label: string };

export type PerfectQuestion = {
  id: string;
  category: PerfectCategory;
  type: PerfectQuestionType;
  /** O que os dois leem — ou, em `know`, o que lê quem responde sobre si. */
  text: string;
  /** Só em `know`: o que lê quem tenta prever. `{nome}` vira o nome do parceiro. */
  predictText?: string;
  /** `same` e `know` trazem as opções; `who` e `scale` são montadas para cada jogador. */
  options?: PerfectOption[];
  /** Só em `scale`: as pontas da régua, para a tela não mostrar cinco números pelados. */
  scale?: { low: string; high: string };
};

/** Quantas perguntas a partida tem. `0` é "sem limite": vai até o host encerrar (§11). */
export const PERFECT_LENGTHS = [10, 20, 30, 0] as const;
/** Segundos por pergunta. `0` é sem cronômetro (§34). */
export const PERFECT_TIMERS = [15, 20, 30, 0] as const;

export type PerfectSettings = {
  /**
   * Vazio = todas, menos a picante. Marcar `Casal` é o opt-in dela.
   *
   * `string[]`, e não `PerfectCategory[]`, porque isto vem da rede: a validação é o sanitizador,
   * não o tipo. (E `CreateRoomInput.settings` cruza as opções dos jogos num tipo só.)
   */
  categories: string[];
  /** Segundos por pergunta; `0` desliga o cronômetro. */
  timerSec: number;
};

export const DEFAULT_PERFECT_SETTINGS: PerfectSettings = { categories: [], timerSec: 20 };

/**
 * Deu match: +100. Rodada em dobro e match final: 200 (§43, §47). O "quase" da escala vale
 * metade do que a rodada vale (§42).
 *
 * Sequência NÃO multiplica ponto (§41): ela é conquista visual. Multiplicador faria a partida
 * ser decidida na terceira pergunta e tiraria a graça de quem começou torto.
 */
export const PERFECT_POINTS = { match: 100, double: 200 } as const;

/** A partir de quantos matches seguidos a tela comemora. */
export const PERFECT_STREAKS = { fire: 2, hot: 3, total: 5 } as const;

export type PerfectCouple = {
  id: string;
  aId: PlayerId;
  bId: PlayerId;
  emoji: string;
  color: string;
};

/** `close` só existe nas perguntas de escala: errar por um ponto não é errar de todo. */
export type PerfectOutcome = 'match' | 'close' | 'miss';

/** A pergunta da rodada, já do jeito que ESTE jogador vê. */
export type PerfectRoundPublic = {
  index: number;
  /** Total de perguntas, ou `null` quando a partida é sem limite. */
  totalRounds: number | null;
  questionId: string;
  category: PerfectCategory;
  type: PerfectQuestionType;
  /** O enunciado já resolvido: com o nome do parceiro onde precisa. */
  prompt: string;
  options: PerfectOption[];
  scale: { low: string; high: string } | null;
  /**
   * Em `know`, de quem é a pergunta. Se for você, responde sobre si; se for o parceiro,
   * você está tentando prever. `null` nas outras mecânicas.
   */
  aboutId: PlayerId | null;
  /** Quanto a rodada vale, já contando dobro e match final. */
  points: number;
  double: boolean;
  final: boolean;
  tieBreak: boolean;
  /**
   * Segundos que faltavam quando o snapshot saiu. O servidor não manda um por segundo: o celular
   * conta sozinho a partir daqui, como no cronômetro do Impostor — assim o relógio de cada
   * aparelho não precisa bater com o do servidor.
   */
  timer: { durationSec: number; remainingSec: number } | null;
};

/**
 * O que cada um marcou, já em texto.
 *
 * Em "quem é mais" a resposta é uma PESSOA, e aí vem também o id dela: só o celular de quem
 * está olhando sabe se aquela pessoa é "você" ou o nome dela.
 */
export type PerfectAnswerReveal = { playerId: PlayerId; label: string; chosenId: PlayerId | null; missing: boolean };

export type PerfectCoupleReveal = {
  coupleId: string;
  answers: PerfectAnswerReveal[];
  outcome: PerfectOutcome;
  points: number;
  /** Matches seguidos depois desta rodada. */
  streak: number;
};

export type PerfectStanding = {
  coupleId: string;
  points: number;
  matches: number;
  rounds: number;
};

export type PerfectResultView = {
  /** 0 "será que deu match?" · 1 as respostas · 2 pontos no placar. */
  stage: 0 | 1 | 2;
  couples: PerfectCoupleReveal[];
  /**
   * O placar entre rodadas. Só a cada cinco perguntas (§45), e some nas três últimas (§46):
   * ninguém sabe quem está ganhando quando a partida decide.
   */
  standings: PerfectStanding[] | null;
};

export type PerfectTitle = {
  key: 'sequencia' | 'leitor' | 'planetas' | 'sintonia';
  emoji: string;
  title: string;
  /** Um dos dois é preenchido: o título é do casal ou de uma pessoa. */
  coupleId: string | null;
  playerId: PlayerId | null;
  detail: string;
};

export type PerfectSummary = {
  standings: PerfectStanding[];
  titles: PerfectTitle[];
  /** Quanto das respostas da mesa coincidiu. Estatística da sessão, não medida de nada (§51). */
  percent: number;
  /** Do casal de quem está olhando: em que combinaram e em que não (§55). */
  mine: {
    coupleId: string;
    matches: number;
    rounds: number;
    bestStreak: number;
    bestCategory: { category: PerfectCategory; matches: number; rounds: number } | null;
    agreed: string[];
    disagreed: string[];
    /** Quantas vezes cada um acertou a previsão sobre o outro (§54). */
    reads: { playerId: PlayerId; hits: number; tries: number }[];
  } | null;
};

/** Como o pareamento está para ESTE jogador (§7–9). */
export type PerfectPairingView = {
  /** Casais já formados, na ordem em que fecharam. */
  couples: PerfectCouple[];
  /** Quem ainda está sem par (só os conectados). */
  waiting: PlayerId[];
  /** Quem este jogador convidou, se alguém. */
  invited: PlayerId | null;
  /** Quem convidou este jogador e ainda espera resposta. */
  invitedBy: PlayerId[];
};

/**
 * Tipos do "Entre Nós". Separados de `couple.ts` porque o banco de cartas
 * (`couple-cards.ts`, 160 cartas) importa daqui sem puxar as regras junto.
 */

/**
 * Quão fundo a carta vai. A sessão começa leve e vai descendo: chegar com uma pergunta
 * profunda na primeira carta soa a interrogatório, não a convite.
 *
 * `intimidade` é opt-in — o casal marca conscientemente, e ela nunca se mistura sozinha.
 */
export type CoupleDepth = 'leve' | 'conectar' | 'profundo' | 'intimidade';

/** `acao` não é pergunta: é uma coisa pequena para fazer agora (um abraço, um elogio). */
export type CoupleKind = 'pergunta' | 'acao';

export type CoupleCard = {
  id: string;
  kind: CoupleKind;
  category: string;
  depth: CoupleDepth;
  text: string;
  /** Uma ou duas perguntas que puxam a MESMA conversa mais fundo. Vazio nas ações. */
  followUps?: string[];
};

/** O clima que o casal escolhe no começo: é ele que decide quais profundidades entram. */
export type CoupleMood = 'leve' | 'conectar' | 'profundo' | 'intimidade' | 'surpresa';

export type CoupleSettings = {
  /** Os dois nomes, na ordem em que foram digitados. */
  names: [string, string];
  mood: CoupleMood;
  /** Vazio = todas as categorias que o clima permite. */
  categories: string[];
  /** Quantas cartas nesta sessão. `0` = conversa livre, até o casal parar. */
  total: number;
};

export const DEFAULT_COUPLE_SETTINGS: CoupleSettings = {
  names: ['', ''],
  mood: 'conectar',
  categories: [],
  total: 10,
};

export type CoupleState = {
  settings: CoupleSettings;
  /** 0 ou 1: quem responde primeiro nesta carta. Alterna a cada carta (§25). */
  firstIndex: 0 | 1;
  /** 1-based. Conta só as cartas que o casal de fato viu. */
  index: number;
  card: CoupleCard | null;
  /** Cartas já mostradas: nenhuma se repete na sessão. */
  usedIds: string[];
  /** O follow-up aberto agora, se o casal pediu para aprofundar. */
  followUp: string | null;
  /** Quantas cartas de cada categoria saíram — é o resumo do fim. */
  seen: Record<string, number>;
  /** `true` depois que o casal encerrou. */
  finished: boolean;
};

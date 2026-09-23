import type { PlayerId } from '../types';

/**
 * Tipos do "Desafio Secreto". Separados de `secretGame.ts` porque o banco de missões
 * (`secret-missions.ts`, 120 missões) importa daqui sem puxar as regras junto.
 */

export const SECRET_DIFFICULTIES = ['facil', 'media', 'dificil'] as const;
export type SecretDifficulty = (typeof SECRET_DIFFICULTIES)[number];

/** Onde o grupo está. Serve para não sortear missão que não cabe no lugar (§54). */
export const SECRET_CONTEXTS = ['casa', 'festa', 'jantar', 'viagem', 'churrasco', 'jogos'] as const;
export type SecretContext = (typeof SECRET_CONTEXTS)[number];

/** Tetos do que o host pode pedir. Muitas acusações viram tiroteio; muitas trocas, escolha de missão. */
export const SECRET_LIMITS = { accusations: { min: 1, max: 5 }, swaps: { min: 0, max: 3 } } as const;

export type SecretMission = {
  id: string;
  category: string;
  difficulty: SecretDifficulty;
  /** Onde a missão faz sentido. Pelo menos um. */
  contexts: SecretContext[];
  text: string;
};

/**
 * O estado de uma missão. `concluida` é só a palavra do jogador: a validação vem no fim,
 * quando o grupo ouve a história e decide (§38) — e é isso que evita interromper a noite.
 */
export type SecretStatus = 'ativa' | 'concluida' | 'pego' | 'validada' | 'rejeitada';

export type SecretSettings = {
  context: SecretContext;
  difficulties: SecretDifficulty[];
  /** Quantas acusações cada um tem na partida inteira. Poucas, para ninguém sair atirando (§30). */
  accusations: number;
  /** Uma troca por pessoa, para o caso de a missão não caber no rolê (§53). */
  swaps: number;
  /** Placar ou só "cumpriu / não cumpriu". O casual é o padrão. */
  competitive: boolean;
};

export const DEFAULT_SECRET_SETTINGS: SecretSettings = {
  context: 'festa',
  difficulties: ['facil', 'media'],
  accusations: 2,
  swaps: 1,
  competitive: false,
};

/**
 * `briefing`: missões distribuídas, cada um revelando a sua escondido.
 * `ativa`: a noite corre, e o app praticamente some.
 * `revelacao`: a hora da verdade, um jogador por vez, com o grupo validando.
 */
export type SecretPhase = 'briefing' | 'ativa' | 'revelacao';

/** O que cada jogador carrega. Só o dono vê a própria missão. */
export type SecretPlayerState = {
  missionId: string;
  status: SecretStatus;
  /** Quando o jogador disse que cumpriu. Comparado com a acusação para decidir quem chegou antes (§33). */
  completedAt: number | null;
  caughtAt: number | null;
  caughtBy: PlayerId | null;
  /** Se já confirmou que viu a própria missão. A partida só começa quando todos confirmarem. */
  ready: boolean;
  accusationsLeft: number;
  swapsLeft: number;
  /** Quantas acusações erradas ele fez, e quantas acertou. Alimenta os destaques. */
  rightAccusations: number;
  wrongAccusations: number;
  /** Quantas vezes foi acusado, certo ou errado — é o "suspeito demais". */
  timesAccused: number;
  /** Votos do grupo na hora da verdade. */
  votesFor: PlayerId[];
  votesAgainst: PlayerId[];
};

/** O que aparece na hora da verdade, um por vez. */
export type SecretReveal = {
  playerId: string;
  mission: SecretMission;
  status: SecretStatus;
  caughtBy: PlayerId | null;
  votesFor: number;
  votesAgainst: number;
};

export type SecretHighlight = {
  key: 'fantasma' | 'detetive' | 'suspeito' | 'araque';
  emoji: string;
  title: string;
  playerId: PlayerId;
  value: string;
};

export const SECRET_POINTS = { facil: 100, media: 200, dificil: 300, rightAccusation: 150, wrongAccusation: -50, ghost: 100 } as const;

/**
 * As opções do host chegam pela rede e podem vir com qualquer coisa. Aqui elas viram um
 * `SecretSettings` válido: sem isso, um cliente adulterado pediria 999 acusações — e com
 * acusação de sobra ninguém precisa deduzir nada, basta tentar todas as combinações.
 */
export function sanitizeSecretSettings(input: Partial<SecretSettings> | undefined): SecretSettings {
  const base = { ...DEFAULT_SECRET_SETTINGS, ...input };
  const difficulties = SECRET_DIFFICULTIES.filter((d) => Array.isArray(base.difficulties) && base.difficulties.includes(d));
  const clamp = (n: unknown, { min, max }: { min: number; max: number }, fallback: number) =>
    Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n as number))) : fallback;
  return {
    context: (SECRET_CONTEXTS as readonly string[]).includes(base.context) ? base.context : DEFAULT_SECRET_SETTINGS.context,
    // Nenhuma faixa marcada deixaria o sorteio sem baralho: volta para o padrão.
    difficulties: difficulties.length ? [...difficulties] : [...DEFAULT_SECRET_SETTINGS.difficulties],
    accusations: clamp(base.accusations, SECRET_LIMITS.accusations, DEFAULT_SECRET_SETTINGS.accusations),
    swaps: clamp(base.swaps, SECRET_LIMITS.swaps, DEFAULT_SECRET_SETTINGS.swaps),
    competitive: Boolean(base.competitive),
  };
}

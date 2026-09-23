import { QUESTIONS } from './perfect-questions';
import {
  DEFAULT_PERFECT_SETTINGS,
  PERFECT_CATEGORIES,
  PERFECT_POINTS,
  PERFECT_TIMERS,
  SPICY_CATEGORY,
  type PerfectCategory,
  type PerfectOption,
  type PerfectOutcome,
  type PerfectQuestion,
  type PerfectSettings,
} from './perfect-types';

export { QUESTIONS as PERFECT_QUESTIONS };

/** Piso técnico de 2 (um casal). Abaixo disso não há o que comparar. O resto é recomendação. */
export const PERFECT_RULES = { minPlayers: 2, recommendedPlayers: 6, maxPlayers: 12 } as const;

/** As opções do host chegam pela rede: aqui viram uma configuração que as regras conseguem usar. */
export function sanitizePerfectSettings(input: Partial<PerfectSettings> | undefined): PerfectSettings {
  const base = { ...DEFAULT_PERFECT_SETTINGS, ...input };
  const categories = PERFECT_CATEGORIES.filter((c) => Array.isArray(base.categories) && base.categories.includes(c));
  const timerSec = (PERFECT_TIMERS as readonly number[]).includes(base.timerSec as number) ? (base.timerSec as number) : DEFAULT_PERFECT_SETTINGS.timerSec;
  return { categories: [...categories], timerSec };
}

/**
 * As perguntas que podem cair nesta partida.
 *
 * Sem categoria escolhida, vale tudo **menos a picante**: "Misturado" é o padrão de uma mesa
 * casual, e uma pergunta de casal apimentada no almoço de família não é surpresa boa (§21–22).
 */
export function perfectPool(settings: PerfectSettings): PerfectQuestion[] {
  if (settings.categories.length === 0) return QUESTIONS.filter((q) => q.category !== SPICY_CATEGORY);
  return QUESTIONS.filter((q) => settings.categories.includes(q.category));
}

/** Quantas perguntas a configuração oferece. A tela usa para avisar quando o host pede mais do que existe. */
export const countPerfectQuestions = (settings: PerfectSettings): number => perfectPool(settings).length;

/**
 * Sorteia a próxima pergunta, sem repetir. Quando o baralho acaba — partida sem limite, ou mais
 * perguntas do que a seleção oferece — recomeça em vez de travar a partida.
 */
export function pickPerfectQuestion(settings: PerfectSettings, asked: Set<string>, rng: () => number, only?: PerfectQuestion['type']): PerfectQuestion {
  const pool = perfectPool(settings).filter((q) => !only || q.type === only);
  const base = pool.length ? pool : QUESTIONS;
  const livres = base.filter((q) => !asked.has(q.id));
  const de = livres.length ? livres : base;
  return de[Math.floor(rng() * de.length)];
}

/** A régua de 1 a 5 vira opção como qualquer outra: a tela não precisa saber que é diferente. */
export const scaleOptions = (): PerfectOption[] => [1, 2, 3, 4, 5].map((n) => ({ id: String(n), emoji: '', label: String(n) }));

/**
 * Deu match?
 *
 * Só a escala tem meio-termo (§42): errar por um ponto é quase acertar, e essa é a diferença
 * entre "não combinamos" e "chegamos perto". Nas outras, ou é a mesma resposta ou não é.
 */
export function outcomeOf(type: PerfectQuestion['type'], a: string | undefined, b: string | undefined): PerfectOutcome {
  if (!a || !b) return 'miss';
  if (a === b) return 'match';
  if (type !== 'scale') return 'miss';
  return Math.abs(Number(a) - Number(b)) === 1 ? 'close' : 'miss';
}

/** Quanto a rodada vale. Dobro na rodada em dobro e no match final (§43, §47). */
export const roundPoints = (double: boolean): number => (double ? PERFECT_POINTS.double : PERFECT_POINTS.match);

export const pointsFor = (outcome: PerfectOutcome, points: number): number => (outcome === 'match' ? points : outcome === 'close' ? Math.round(points / 2) : 0);

export type { PerfectCategory };

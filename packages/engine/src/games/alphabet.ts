import { THEMES } from './alphabet-themes';
import type { AlphabetTheme } from './alphabet-types';
import type { BombSettings, BombState } from './bomb-types';

/**
 * Bomba-Relógio: Alfabeto — a parte que difere do clássico.
 *
 * Pavio, sustos, ordem, modos e placar são os mesmos e vivem em `bomb.ts`; aqui fica só o que
 * esta variante tem de próprio: o tema, a grade de letras e o que acontece quando elas acabam.
 *
 * A diferença que muda o jogo: **tocar a letra é que passa a bomba**. Não há botão separado, o
 * que torna a jogada instantânea — e, como cada letra só serve uma vez, a rodada aperta sozinha.
 */

export const ALPHABET_RULES = {
  /** Um tema com menos que isto trava o grupo no meio da rodada. */
  minLetters: 14,
  /** Mais folga que no clássico: com as letras sumindo, pensar demora (§10). */
  safetySeconds: 10,
  points: { letter: 10, disarm: 50 },
} as const;

export const FULL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** As categorias dos temas, na ordem em que aparecem na tela. */
export const ALPHABET_CATEGORIES = ['Natureza', 'Comida', 'Lugares', 'Cultura', 'Dia a dia', 'Diversão'] as const;

const pick = <T>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)];

function matches(theme: AlphabetTheme, settings: BombSettings): boolean {
  const categoriaOk = settings.categories.length === 0 || settings.categories.includes(theme.category);
  return categoriaOk && settings.difficulties.includes(theme.difficulty);
}

/** Quantos temas existem para uma configuração — é o teto de rodadas sem repetir. */
export const countThemes = (settings: BombSettings): number => THEMES.filter((t) => matches(t, settings)).length;

export function pickTheme(settings: BombSettings, usedIds: Set<string>, rng: () => number = Math.random): AlphabetTheme {
  const elegiveis = THEMES.filter((t) => matches(t, settings));
  // Configuração impossível: cai no baralho inteiro em vez de deixar a rodada sem tema.
  const baralho = elegiveis.length ? elegiveis : THEMES;
  const novos = baralho.filter((t) => !usedIds.has(t.id));
  return pick(novos.length ? novos : baralho, rng);
}

/**
 * As letras da rodada. No Hardcore vem o A–Z inteiro, inclusive as que o tema não cobre — a
 * dificuldade passa a ser encontrar qualquer coisa que comece com K, W, X ou Y.
 */
export const lettersFor = (theme: AlphabetTheme, settings: BombSettings): string =>
  settings.letterSet === 'hardcore' ? FULL_ALPHABET : theme.letters;

/** Quais letras ainda estão de pé. */
export function remainingLetters(state: BombState): string[] {
  const round = state.alphabet;
  if (!round) return [];
  const usadas = new Set(round.used.map((u) => u.letter));
  return [...round.letters].filter((letra) => !usadas.has(letra));
}

/** A letra pode ser tocada agora? Falso se não é do tema, já saiu, ou a bomba não está acesa. */
export function canUseLetter(state: BombState, letter: string): boolean {
  if (state.phase !== 'armed' || !state.alphabet) return false;
  const letra = letter.toUpperCase();
  return state.alphabet.letters.includes(letra) && !state.alphabet.used.some((u) => u.letter === letra);
}

/** Monta o tema da rodada. Chamado por `bomb.ts` ao abrir cada rodada do Alfabeto. */
export function startAlphabetRound(settings: BombSettings, usedThemeIds: Set<string>, rng: () => number) {
  const theme = pickTheme(settings, usedThemeIds, rng);
  return { theme, round: { themeId: theme.id, name: theme.name, emoji: theme.emoji, letters: lettersFor(theme, settings), used: [] } };
}

/**
 * Normaliza a primeira letra de uma resposta: acento e cedilha pertencem à letra base (§23),
 * então "Água" é A e "Çapata" é C. Serve para temas personalizados e para testes; na partida
 * quem escolhe a letra é a pessoa, tocando na grade.
 */
export function baseLetter(word: string): string {
  const semAcento = word
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return (semAcento[0] ?? '').toUpperCase();
}

/** Um tema só entra no modo normal se tiver letras suficientes para o grupo não travar (§20). */
export const isPlayableTheme = (theme: AlphabetTheme): boolean => theme.letters.length >= ALPHABET_RULES.minLetters;

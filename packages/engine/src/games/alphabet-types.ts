/**
 * Tipos da variante Alfabeto da Bomba-Relógio. Separados porque o banco de temas
 * (`alphabet-themes.ts`) importa daqui sem puxar as regras junto.
 */

export type AlphabetDifficulty = 'facil' | 'medio' | 'dificil';

/**
 * Um tema e as letras que valem nele.
 *
 * `letters` não é o alfabeto inteiro de propósito: cada letra listada precisa ter resposta que
 * um brasileiro lembre sob pressão. Oferecer "X" em Países trava a rodada e mata a brincadeira —
 * por isso o tema carrega a própria lista, e o modo Hardcore é quem devolve o A–Z completo.
 */
export type AlphabetTheme = {
  id: string;
  name: string;
  emoji: string;
  category: string;
  difficulty: AlphabetDifficulty;
  /** Maiúsculas, em ordem, sem separador: `'ABCDEFGHIJLMNOPRSTUVZ'`. */
  letters: string;
};

/** O tema da rodada, já com o que foi gasto. */
export type AlphabetRound = {
  themeId: string;
  name: string;
  emoji: string;
  /** As letras desta rodada (do tema, ou o A–Z inteiro no Hardcore). */
  letters: string;
  /** Usadas, na ordem em que saíram — é o histórico da rodada. */
  used: { letter: string; playerId: string; ms: number }[];
};

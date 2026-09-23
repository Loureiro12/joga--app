import type { AlphabetTheme } from './alphabet-types';

/**
 * Banco de temas do Bomba-Relógio: Alfabeto.
 *
 * Critério para `letters`: só entra a letra que tem resposta que um brasileiro
 * comum diz em voz alta em 3 segundos, sem pensar. Letra sem resposta óbvia
 * travaria a rodada, então fica de fora — por isso K, W, X e Y aparecem apenas
 * onde existe resposta de verdade (Kibon, Xuxa, Xadrez, Xícara, YouTube).
 * A dificuldade mede quantas respostas o tema comporta por letra, não o quanto
 * a pessoa precisa saber: Animais é fácil, Games é difícil.
 */
export const THEMES: AlphabetTheme[] = [
  // ─── Natureza ───────────────────────────────────────────────────────────
  {
    id: 'animais',
    name: 'Animais',
    emoji: '🐶',
    category: 'Natureza',
    difficulty: 'facil',
    letters: 'ABCDEFGHIJLMOPRSTUVZ',
  },
  {
    id: 'frutas',
    name: 'Frutas',
    emoji: '🍓',
    category: 'Natureza',
    difficulty: 'facil',
    letters: 'ABCDFGJKLMPRTU',
  },
  {
    id: 'corpo-humano',
    name: 'Corpo humano',
    emoji: '💪',
    category: 'Natureza',
    difficulty: 'medio',
    letters: 'ABCDEFGIJLMNOPQRSTUV',
  },

  // ─── Comida ─────────────────────────────────────────────────────────────
  {
    id: 'comidas',
    name: 'Comidas',
    emoji: '🍽️',
    category: 'Comida',
    difficulty: 'facil',
    letters: 'ABCDEFGHILMNOPQRSTV',
  },
  {
    id: 'bebidas',
    name: 'Bebidas',
    emoji: '🥤',
    category: 'Comida',
    difficulty: 'medio',
    letters: 'ABCDEFGLMNPRSTUV',
  },
  {
    id: 'doces',
    name: 'Doces',
    emoji: '🍬',
    category: 'Comida',
    difficulty: 'dificil',
    letters: 'ABCDGJLMNOPQRST',
  },

  // ─── Lugares ────────────────────────────────────────────────────────────
  {
    id: 'paises',
    name: 'Países',
    emoji: '🌍',
    category: 'Lugares',
    difficulty: 'facil',
    letters: 'ABCDEFGHIJLMNPQRSTUVZ',
  },
  {
    id: 'cidades-do-brasil',
    name: 'Cidades do Brasil',
    emoji: '🏙️',
    category: 'Lugares',
    difficulty: 'medio',
    letters: 'ABCFGIJLMNOPRSTUV',
  },
  {
    id: 'lugares-da-cidade',
    name: 'Lugares da cidade',
    emoji: '📍',
    category: 'Lugares',
    difficulty: 'medio',
    letters: 'ABCEFGHJLMPQRSTUZ',
  },

  // ─── Cultura ────────────────────────────────────────────────────────────
  {
    id: 'filmes',
    name: 'Filmes',
    emoji: '🎬',
    category: 'Cultura',
    difficulty: 'facil',
    letters: 'ABCDEFGHIJKLMOPRSTUVXZ',
  },
  {
    id: 'cantores',
    name: 'Cantores',
    emoji: '🎤',
    category: 'Cultura',
    difficulty: 'medio',
    letters: 'ABCDEFGIJKLMNPRSTVWXZ',
  },
  {
    id: 'desenhos',
    name: 'Desenhos',
    emoji: '📺',
    category: 'Cultura',
    difficulty: 'medio',
    letters: 'ABCDFGHJLMNOPSTZ',
  },

  // ─── Dia a dia ──────────────────────────────────────────────────────────
  {
    id: 'coisas-de-casa',
    name: 'Coisas de casa',
    emoji: '🏠',
    category: 'Dia a dia',
    difficulty: 'facil',
    letters: 'ABCEFGJLMPQRSTVX',
  },
  {
    id: 'profissoes',
    name: 'Profissões',
    emoji: '👷',
    category: 'Dia a dia',
    difficulty: 'facil',
    letters: 'ABCDEFGJMPRSTVZ',
  },
  {
    id: 'marcas',
    name: 'Marcas',
    emoji: '🏷️',
    category: 'Dia a dia',
    difficulty: 'medio',
    letters: 'ABCDEFGHIJKLMNOPRSTUVWXYZ',
  },

  // ─── Diversão ───────────────────────────────────────────────────────────
  {
    id: 'esportes',
    name: 'Esportes',
    emoji: '⚽',
    category: 'Diversão',
    difficulty: 'medio',
    letters: 'ABCEFGHJKMNPRSTVX',
  },
  {
    id: 'games',
    name: 'Games',
    emoji: '🎮',
    category: 'Diversão',
    difficulty: 'dificil',
    letters: 'ABCFGLMNOPRSTVWZ',
  },
  {
    id: 'coisas-de-festa',
    name: 'Coisas de festa',
    emoji: '🎉',
    category: 'Diversão',
    difficulty: 'dificil',
    letters: 'ABCDEFGLMPRSTV',
  },
];

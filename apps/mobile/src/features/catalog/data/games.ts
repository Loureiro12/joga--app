import { colors } from '@/core/theme';

export type IllustrationKey = 'eyes' | 'pillArrow' | 'mask' | 'bomb' | 'dice' | 'trophy';

export type GameCategoryOption = { id: string; label: string; emoji: string; premium?: boolean };

/**
 * Definição de um jogo do catálogo. Adicionar um jogo novo = adicionar um item aqui
 * (+ um módulo de regras em `features/match/games` quando ele for jogável).
 * Na fase 2 esta lista pode vir do backend/remote config sem mudar as telas.
 */
export type GameDefinition = {
  id: string;
  name: string;
  /** Overline do card: Dedução, Polêmico… */
  category: string;
  tagline: string;
  description: string;
  emoji: string;
  color: string;
  illustration: IllustrationKey;
  minPlayers: number;
  maxPlayers: number;
  playersLabel: string;
  /** Home/Detalhes: "10–20 min" · Explorar: "15 min" */
  durationLabel: string;
  durationShort: string;
  infoChips: { emoji: string; label: string }[];
  howToPlay: string[];
  wordCategories: GameCategoryOption[];
  roundOptions: number[];
  defaults: { players: number; category: string; rounds: number };
  /** Filtros do Explorar em que o jogo aparece. */
  tags: string[];
  trending?: boolean;
  /** Tem fluxo de partida implementado? Os demais aparecem como "Em breve". */
  playable: boolean;
};

const comingSoon = {
  infoChips: [],
  howToPlay: [],
  wordCategories: [],
  roundOptions: [3, 5, 10],
  defaults: { players: 6, category: '', rounds: 5 },
  playable: false,
} satisfies Partial<GameDefinition>;

export const GAMES: GameDefinition[] = [
  {
    id: 'impostor',
    name: 'Impostor',
    category: 'Dedução',
    tagline: 'Todo mundo sabe a palavra. Menos um.',
    description:
      'Todos recebem uma palavra secreta, menos o impostor. Dê pistas sem entregar demais e descubra quem está perdido.',
    emoji: '👀',
    color: colors.primary,
    illustration: 'eyes',
    minPlayers: 3,
    maxPlayers: 12,
    playersLabel: '3–12 jogadores',
    durationLabel: '10–20 min',
    durationShort: '15 min',
    infoChips: [
      { emoji: '👥', label: '3–12 jogadores' },
      { emoji: '⏱', label: '10–20 minutos' },
      { emoji: '🎯', label: 'Fácil de aprender' },
    ],
    howToPlay: [
      'Todos recebem a mesma palavra secreta. Um jogador recebe apenas "impostor".',
      'Em ordem, cada um dá uma pista curta. Nem óbvia demais, nem vaga demais.',
      'Votem em quem parece perdido. Se acertarem, o grupo pontua. Se não, o impostor leva.',
    ],
    wordCategories: [
      { id: 'Comidas', label: 'Comidas', emoji: '🍔' },
      { id: 'Filmes', label: 'Filmes', emoji: '🎬' },
      { id: 'Futebol', label: 'Futebol', emoji: '⚽' },
      { id: 'Lugares', label: 'Lugares', emoji: '🌎' },
      { id: 'Aleatório', label: 'Aleatório', emoji: '🎲' },
    ],
    roundOptions: [3, 5, 10],
    defaults: { players: 6, category: 'Comidas', rounds: 5 },
    tags: ['Em alta', 'Dedução', 'Engraçados'],
    trending: true,
    playable: true,
  },
  {
    ...comingSoon,
    id: 'mais-provavel',
    name: 'Quem é mais provável?',
    category: 'Polêmico',
    tagline: 'Descubra o que seus amigos pensam.',
    description: 'Uma pergunta, todos apontam para alguém. Descubra o que o grupo realmente pensa de você.',
    emoji: '👉',
    color: colors.accent,
    illustration: 'pillArrow',
    minPlayers: 3,
    maxPlayers: 12,
    playersLabel: '3+ jogadores',
    durationLabel: '10 min',
    durationShort: '10 min',
    tags: ['Em alta', 'Engraçados', 'Festa'],
  },
  {
    ...comingSoon,
    id: 'desafio-secreto',
    name: 'Desafio secreto',
    category: 'Festa',
    tagline: 'Complete sua missão sem ninguém perceber.',
    description: 'Cada um recebe uma missão secreta para cumprir durante a noite. Quem for pego, perde.',
    emoji: '🕵️',
    color: colors.success,
    illustration: 'mask',
    minPlayers: 3,
    maxPlayers: 12,
    playersLabel: '3+ jogadores',
    durationLabel: '20 min',
    durationShort: '20 min',
    tags: ['Em alta', 'Festa', 'Família'],
  },
  {
    ...comingSoon,
    id: 'bomba-relogio',
    name: 'Bomba-relógio',
    category: 'Caótico',
    tagline: 'Responda antes que estoure na sua mão.',
    description: 'O celular passa de mão em mão com um cronômetro escondido. Responda rápido e passe adiante.',
    emoji: '💣',
    color: colors.danger,
    illustration: 'bomb',
    minPlayers: 4,
    maxPlayers: 12,
    playersLabel: '4+ jogadores',
    durationLabel: '15 min',
    durationShort: '15 min',
    tags: ['Em alta', 'Festa', 'Rápidos'],
  },
  {
    ...comingSoon,
    id: 'verdade-ou-mito',
    name: 'Verdade ou mito',
    category: 'Rápido',
    tagline: 'Fato curioso ou invenção? Decida rápido.',
    description: 'Afirmações absurdas, algumas verdadeiras. O grupo vota e quem errar menos leva.',
    emoji: '⚡',
    color: colors.primaryLight,
    illustration: 'dice',
    minPlayers: 2,
    maxPlayers: 12,
    playersLabel: '2+ jogadores',
    durationLabel: '5 min',
    durationShort: '5 min',
    tags: ['Rápidos', 'Família', 'Engraçados'],
  },
  {
    ...comingSoon,
    id: 'casal-perfeito',
    name: 'Casal perfeito',
    category: 'Casais',
    tagline: 'Vocês se conhecem mesmo?',
    description: 'Perguntas em dupla para descobrir qual casal está mais em sintonia.',
    emoji: '❤️',
    color: colors.surface,
    illustration: 'trophy',
    minPlayers: 2,
    maxPlayers: 8,
    playersLabel: '2–8 jogadores',
    durationLabel: '20 min',
    durationShort: '20 min',
    tags: ['Casais'],
  },
];

export const getGame = (id: string | undefined) => GAMES.find((g) => g.id === id);

/** "3–12 jogadores" → "3–12" (meta compacta do Explorar). */
export const playersShort = (g: GameDefinition) => g.playersLabel.replace(' jogadores', '');

export const EXPLORE_FILTERS = [
  { id: 'Em alta', label: '🔥 Em alta' },
  { id: 'Engraçados', label: '😂 Engraçados' },
  { id: 'Dedução', label: '👀 Dedução' },
  { id: 'Festa', label: '🎉 Festa' },
  { id: 'Casais', label: '❤️ Casais' },
  { id: 'Família', label: '👨‍👩‍👧 Família' },
  { id: 'Rápidos', label: '⚡ Rápidos' },
];

export const MOODS = [
  { emoji: '😂', label: 'Engraçado', filter: 'Engraçados' },
  { emoji: '🔥', label: 'Caótico', filter: 'Em alta' },
  { emoji: '👀', label: 'Polêmico', filter: 'Dedução' },
  { emoji: '❤️', label: 'Casais', filter: 'Casais' },
  { emoji: '🎉', label: 'Festa', filter: 'Festa' },
  { emoji: '👨‍👩‍👧', label: 'Família', filter: 'Família' },
  { emoji: '⚽', label: 'Futebol', filter: 'Em alta' },
];

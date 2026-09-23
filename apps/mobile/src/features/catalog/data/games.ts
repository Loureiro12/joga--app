// De `tokens` e não do barrel `@/core/theme`: o barrel carrega os arquivos de fonte, e este módulo
// é só dado — assim ele roda em teste, no servidor ou em qualquer lugar sem o ambiente do app.
import type { GameId } from '@jogae/engine';

import { colors } from '@/core/theme/tokens';

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
  /** Piso do motor: abaixo disso a partida travaria. Não é sugestão. */
  minPlayers: number;
  /** Quantos o jogo pede para ficar bom. A tela sugere; o host decide. */
  recommendedPlayers: number;
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
  /** Qual motor conduz a partida. Só os jogáveis têm — é o que vai em `createRoom`. */
  engineId?: GameId;
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
    engineId: 'impostor',
    name: 'Impostor',
    category: 'Dedução',
    tagline: 'Todo mundo sabe a palavra. Menos um.',
    description:
      'Todos recebem uma palavra secreta, menos o impostor. Dê pistas sem entregar demais e descubra quem está perdido.',
    emoji: '👀',
    color: colors.primary,
    illustration: 'eyes',
    minPlayers: 2,
    recommendedPlayers: 3,
    maxPlayers: 12,
    playersLabel: '3–12 jogadores',
    durationLabel: '10–20 min',
    durationShort: '15 min',
    infoChips: [
      { emoji: '👥', label: 'Melhor com 3 a 12' },
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
      { id: 'Animais', label: 'Animais', emoji: '🐶' },
      { id: 'Profissões', label: 'Profissões', emoji: '👷' },
      { id: 'Objetos', label: 'Objetos', emoji: '🪑' },
      // 'Aleatório' não é uma lista: o engine sorteia uma categoria diferente a cada rodada.
      { id: 'Aleatório', label: 'Aleatório', emoji: '🎲' },
    ],
    roundOptions: [3, 5, 10],
    defaults: { players: 6, category: 'Comidas', rounds: 5 },
    tags: ['Em alta', 'Dedução', 'Engraçados'],
    trending: true,
    playable: true,
  },
  {
    id: 'mais-provavel',
    engineId: 'likely',
    name: 'Quem é mais provável?',
    category: 'Polêmico',
    tagline: 'Descubra o que seus amigos pensam.',
    description: 'Uma pergunta, todos apontam para alguém. Descubra o que o grupo realmente pensa de você.',
    emoji: '👉',
    color: colors.accent,
    illustration: 'pillArrow',
    minPlayers: 2,
    recommendedPlayers: 3,
    maxPlayers: 20,
    playersLabel: '3–20 jogadores',
    durationLabel: '10–30 min',
    durationShort: '20 min',
    infoChips: [
      { emoji: '👥', label: 'Melhor com 3 a 20' },
      { emoji: '⏱', label: '10–30 minutos' },
      { emoji: '🗳', label: 'Voto secreto' },
    ],
    howToPlay: [
      'Uma pergunta aparece para todos: "quem é mais provável de…".',
      'Cada um vota em silêncio na pessoa que mais combina. Ninguém vê os votos parciais.',
      'Os votos são revelados juntos. Empate vale: não existe resposta certa, só o que o grupo acha.',
    ],
    // As categorias do banco de perguntas, na mesma ordem em que aparecem na tela.
    wordCategories: [
      { id: 'Engraçado', label: 'Engraçado', emoji: '😂' },
      { id: 'Exposed', label: 'Exposed', emoji: '👀' },
      { id: 'Caos', label: 'Caos', emoji: '🔥' },
      { id: 'Relacionamentos', label: 'Relacionamentos', emoji: '❤️' },
      { id: 'Festa', label: 'Festa', emoji: '🎉' },
      { id: 'Trabalho', label: 'Trabalho', emoji: '💼' },
      { id: 'Família', label: 'Família', emoji: '👨‍👩‍👧' },
      { id: 'Futebol', label: 'Futebol', emoji: '⚽' },
      { id: 'Aleatório', label: 'Aleatório', emoji: '🎲' },
    ],
    // "Sem limite" é o 0: a partida vai até o host encerrar.
    roundOptions: [10, 20, 30, 0],
    defaults: { players: 8, category: 'Aleatório', rounds: 10 },
    tags: ['Em alta', 'Engraçados', 'Festa'],
    trending: true,
    playable: true,
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
    recommendedPlayers: 3,
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
    recommendedPlayers: 4,
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
    recommendedPlayers: 2,
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
    recommendedPlayers: 2,
    maxPlayers: 8,
    playersLabel: '2–8 jogadores',
    durationLabel: '20 min',
    durationShort: '20 min',
    tags: ['Casais'],
  },
];

export const getGame = (id: string | undefined) => GAMES.find((g) => g.id === id);

/** O snapshot traz o id do MOTOR (`impostor`, `likely`), que nem sempre é o id do catálogo. */
export const getGameByEngine = (engineId: string | undefined) => GAMES.find((g) => g.engineId === engineId);

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

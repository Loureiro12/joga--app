/**
 * Todas as rotas do app em um só lugar. Telas nunca escrevem paths na mão —
 * renomear uma rota é mudar o arquivo em `src/app` e esta constante.
 */
export const routes = {
  splash: '/',
  onboarding: '/onboarding',
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  home: '/(tabs)',
  explore: '/(tabs)/explore',
  profile: '/(tabs)/profile',
  game: (gameId: string) => `/game/${gameId}` as const,
  createMatch: (gameId: string) => `/create-match?gameId=${gameId}` as const,
  join: '/join',
  ai: '/ai',
  premium: '/premium',
  editProfile: '/profile/edit',
  settings: '/profile/settings',
  friends: '/profile/friends',
  history: '/profile/history',
  match: {
    lobby: '/match/lobby',
    reveal: '/match/reveal',
    round: '/match/round',
    vote: '/match/vote',
    waitingVotes: '/match/waiting-votes',
    result: '/match/result',
    ranking: '/match/ranking',
    end: '/match/end',
    aborted: '/match/aborted',
    // Quem é Mais Provável: telas próprias da rodada; lobby, placar e sala fechada são compartilhados.
    question: '/match/question',
    likelyVote: '/match/likely-vote',
    likelyWaiting: '/match/likely-waiting',
    likelyResult: '/match/likely-result',
    likelyEnd: '/match/likely-end',
    // Desafio Secreto
    briefing: '/match/briefing',
    mission: '/match/mission',
    verdict: '/match/verdict',
    secretEnd: '/match/secret-end',
    // Casal Perfeito
    pairing: '/match/pairing',
    answer: '/match/answer',
    matchReveal: '/match/match-reveal',
    perfectEnd: '/match/perfect-end',
  },
  /** Bomba-Relógio: um celular só, sem sala — por isso fora de `match`. */
  bomb: {
    /** `variant` diz qual das duas bombas: o clássico ou o Alfabeto. */
    setup: (variant: 'classico' | 'alfabeto' = 'classico') => `/bomb/setup?variant=${variant}` as const,
    settings: '/bomb/settings',
    round: '/bomb/round',
    end: '/bomb/end',
  },
  /** Entre Nós: também local, e com fluxo próprio (nada de bomba nem de placar). */
  couple: {
    setup: '/couple/setup',
    settings: '/couple/settings',
    session: '/couple/session',
    end: '/couple/end',
  },
} as const;

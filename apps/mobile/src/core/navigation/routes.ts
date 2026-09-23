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
  },
} as const;

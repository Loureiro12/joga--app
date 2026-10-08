import { routes } from '@/core/navigation/routes';

import type { RoomSnapshot } from '@jogae/engine';

/**
 * Fase do servidor → tela. É aqui (e só aqui) que o fluxo de partida é decidido.
 * Cada jogo tem suas telas de rodada; lobby, fim e sala fechada são as mesmas para todos.
 */
export function routeForSnapshot(s: RoomSnapshot): string {
  const likely = s.game.kind === 'likely';
  const secret = s.game.kind === 'secret';
  const perfect = s.game.kind === 'perfect';
  // A bomba tem uma tela só: navegar entre as fases piscaria a tela na hora da tensão.
  const bomb = s.game.kind === 'bomb';
  switch (s.room.phase) {
    case 'lobby':
      return routes.match.lobby;
    case 'role_reveal':
      return routes.match.reveal;
    case 'clues':
      return routes.match.round;
    case 'question':
      return routes.match.question;
    case 'briefing':
      return routes.match.briefing;
    case 'mission':
      return routes.match.mission;
    case 'verdict':
      return routes.match.verdict;
    case 'pairing':
      return routes.match.pairing;
    case 'handoff':
    case 'armed':
      return routes.match.bombRoom;
    case 'answering':
      return routes.match.answer;
    case 'voting':
      if (!s.votes?.myVote) return likely ? routes.match.likelyVote : routes.match.vote;
      return likely ? routes.match.likelyWaiting : routes.match.waitingVotes;
    case 'revealing':
      if (bomb) return routes.match.bombRoom;
      if (perfect) return routes.match.matchReveal;
      return likely ? routes.match.likelyResult : routes.match.result;
    case 'finished':
      if (bomb) return routes.match.bombRoom;
      if (secret) return routes.match.secretEnd;
      if (perfect) return routes.match.perfectEnd;
      return likely ? routes.match.likelyEnd : routes.match.end;
    case 'closed':
      return routes.match.aborted;
  }
}

import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';

import { routes } from '@/core/navigation/routes';

import type { RoomSnapshot } from '@jogae/engine';
import { useSnapshot } from '../store/matchStore';

/**
 * Fase do servidor → tela. É aqui (e só aqui) que o fluxo de partida é decidido.
 * Cada jogo tem suas telas de rodada; lobby, fim e sala fechada são as mesmas para todos.
 */
export function routeForSnapshot(s: RoomSnapshot): string {
  const likely = s.game.kind === 'likely';
  const secret = s.game.kind === 'secret';
  const perfect = s.game.kind === 'perfect';
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
    case 'answering':
      return routes.match.answer;
    case 'voting':
      if (!s.votes?.myVote) return likely ? routes.match.likelyVote : routes.match.vote;
      return likely ? routes.match.likelyWaiting : routes.match.waitingVotes;
    case 'revealing':
      if (perfect) return routes.match.matchReveal;
      return likely ? routes.match.likelyResult : routes.match.result;
    case 'finished':
      if (secret) return routes.match.secretEnd;
      if (perfect) return routes.match.perfectEnd;
      return likely ? routes.match.likelyEnd : routes.match.end;
    case 'closed':
      return routes.match.aborted;
  }
}

/**
 * Navegação dirigida pelo servidor: quando a fase (ou a rodada) muda, todos os
 * celulares trocam de tela juntos — host e convidados usam o mesmo caminho.
 * Transições locais dentro da mesma fase (Resultado → Placar) são feitas pela própria tela.
 */
export function useMatchNavigator() {
  const snapshot = useSnapshot();
  const target = snapshot ? routeForSnapshot(snapshot) : null;
  const key = snapshot ? `${target}#${snapshot.room.roundIndex}` : null;
  const pathname = usePathname();

  useEffect(() => {
    if (target && target !== pathname) router.replace(target);
    // `key` inclui a rodada: role_reveal da rodada 2 precisa re-navegar mesmo vindo do placar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

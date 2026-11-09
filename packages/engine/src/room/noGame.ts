import { RoomError, type GameView, type VoteProgress } from '../types';

import type { GameRules } from './GameRules';

/**
 * A sala que ainda não escolheu o jogo.
 *
 * Existe para que "criar sala" e "escolher o jogo" sejam dois momentos — o grupo se reúne
 * primeiro e decide depois, que é como as coisas acontecem numa mesa de verdade.
 *
 * É um jogo de mentira só na mecânica: ele não tem rodada, não tem comando e **recusa começar**.
 * A alternativa seria a sala nascer com um jogo qualquer e a tela mentir até alguém trocar —
 * o grupo veria "Impostor" num lugar onde ninguém escolheu Impostor.
 */
export type NoGameState = Record<string, never>;

export const noGame: GameRules<NoGameState> = {
  id: 'none',
  // O piso existe para a sala não fechar sozinha; quem decide o mínimo é o jogo escolhido.
  minPlayers: 1,
  recommendedPlayers: 1,
  maxPlayers: 20,
  hostCommands: new Set([]),

  initial() {
    return {};
  },
  hydrate() {
    return {};
  },

  startMatch() {
    // Nunca chega aqui: a sala barra antes, com uma mensagem que explica o que falta.
    throw new RoomError('bad_request');
  },
  dispatch() {
    throw new RoomError('invalid_phase');
  },
  step() {
    return false;
  },
  recheck() {},
  playerRemoved() {},
  reset() {},
  deadlines() {
    return [];
  },

  viewFor(): GameView {
    return { kind: 'none' };
  },
  voteProgress(): VoteProgress | null {
    return null;
  },
  recordExtras() {
    return { impostorsCaught: 0, perPlayer: {} };
  },
};

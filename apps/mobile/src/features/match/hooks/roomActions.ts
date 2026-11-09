import { RoomError, type CreateRoomInput, type PlayerId, type RoomErrorCode } from '@jogae/engine';

import { toast } from '@/core/ui/toast';
import { services } from '@/services';

import { getIdentity } from './useIdentity';

export const ROOM_ERROR_MESSAGES: Partial<Record<RoomErrorCode, string>> = {
  room_not_found: 'Sala não encontrada. Confira o código com o host.',
  room_full: 'Essa sala já está cheia.',
  match_in_progress: 'A partida já começou. Peça para o host te chamar na próxima.',
  not_enough_players: 'Faltam jogadores conectados para começar.',
  not_host: 'Só o host pode fazer isso.',
  rate_limited: 'Muitas tentativas. Espere um minuto e tente de novo.',
  unauthenticated: 'Sua sessão expirou. Entre de novo.',
  timeout: 'Sem resposta do servidor. Confira a conexão.',
};

export const roomErrorMessage = (e: unknown, fallback = 'Não deu certo. Tente de novo.') =>
  (e instanceof RoomError && ROOM_ERROR_MESSAGES[e.code]) || fallback;

/**
 * Comandos da sala para as telas. Com servidor real um comando pode falhar (rede, fase já mudou);
 * a tela não precisa tratar: o erro vira toast e o estado continua sendo o último snapshot.
 * `invalid_phase` é silencioso — quase sempre é um toque duplo numa fase que acabou de mudar.
 */
const run = (promise: Promise<void>) =>
  promise.catch((e: unknown) => {
    if (e instanceof RoomError && e.code === 'invalid_phase') return;
    toast(roomErrorMessage(e), 'error');
  });

/**
 * Abre uma sala **sem jogo**: o grupo se reúne primeiro e decide depois, que é como as coisas
 * acontecem numa mesa de verdade. O jogo é escolhido no lobby, por `setGame`.
 */
export async function criarSalaVazia(): Promise<boolean> {
  try {
    await services.room.createRoom({ gameId: 'none', category: '', totalRounds: 0, maxPlayers: 12 }, getIdentity());
    return true;
  } catch (e) {
    toast(roomErrorMessage(e, 'Não deu para abrir a sala. Tente de novo.'), 'error');
    return false;
  }
}

export const roomActions = {
  setGame: (input: CreateRoomInput) => run(services.room.setGame(input)),
  startMatch: () => run(services.room.startMatch()),
  setTimerRunning: (running: boolean) => run(services.room.setTimerRunning(running)),
  resetTimer: () => run(services.room.resetTimer()),
  openVoting: () => run(services.room.openVoting()),
  nextRound: () => run(services.room.nextRound()),
  playAgain: () => run(services.room.playAgain()),
  endVoting: () => run(services.room.endVoting()),
  skipQuestion: () => run(services.room.skipQuestion()),
  endMatch: () => run(services.room.endMatch()),
  missionReady: () => run(services.room.missionReady()),
  missionDone: () => run(services.room.missionDone()),
  accuse: (targetId: PlayerId, missionId: string) => run(services.room.accuse(targetId, missionId)),
  swapMission: () => run(services.room.swapMission()),
  nextReveal: () => run(services.room.nextReveal()),
  voteReveal: (valid: boolean) => run(services.room.voteReveal(valid)),
  pairWith: (targetId: PlayerId) => run(services.room.pairWith(targetId)),
  unpair: () => run(services.room.unpair()),
  beginQuestions: () => run(services.room.beginQuestions()),
  submitAnswer: (value: string) => run(services.room.submitAnswer(value)),
  armBomb: () => run(services.room.armBomb()),
  passBomb: () => run(services.room.passBomb()),
  useLetter: (letter: string) => run(services.room.useLetter(letter)),
  ackRole: () => run(services.room.ackRole()),
  castVote: (targetId: PlayerId) => run(services.room.castVote(targetId)),
  setPaused: (paused: boolean) => run(services.room.setPaused(paused)),
  guessIdentity: (guess: string) => run(services.room.guessIdentity(guess)),
  takeHint: () => run(services.room.takeHint()),
  passTurn: () => run(services.room.passTurn()),
  endRound: () => run(services.room.endRound()),
};

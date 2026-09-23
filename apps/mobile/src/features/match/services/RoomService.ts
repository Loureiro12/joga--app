import type { ConnectionState, CreateRoomInput, PlayerId, PlayerIdentity, RoomSnapshot } from '@jogae/engine';

export type Unsubscribe = () => void;

/**
 * Contrato da camada de sala em tempo real.
 *
 * As telas e o store só conhecem ESTA interface. A fase 1 usa `MockRoomService`;
 * a fase 2 implementa a mesma interface sobre Supabase Realtime / Firebase RTDB
 * e troca a instância em `src/services/index.ts` — nenhuma tela muda.
 *
 * Regras: comandos são "fire and forget" do ponto de vista da UI — o resultado
 * chega como um novo `RoomSnapshot` via `subscribe`. Comandos de host lançam
 * `RoomError('not_host')` se chamados por convidado.
 */
export interface RoomService {
  /* ciclo de vida */
  createRoom(input: CreateRoomInput, me: PlayerIdentity): Promise<RoomSnapshot>;
  joinRoom(code: string, me: PlayerIdentity): Promise<RoomSnapshot>;
  leaveRoom(): Promise<void>;

  /* stream */
  subscribe(listener: (snapshot: RoomSnapshot | null) => void): Unsubscribe;
  subscribeConnection(listener: (state: ConnectionState) => void): Unsubscribe;
  retryConnection(): void;

  /* comandos do host */
  startMatch(): Promise<void>;
  setTimerRunning(running: boolean): Promise<void>;
  resetTimer(): Promise<void>;
  openVoting(): Promise<void>;
  nextRound(): Promise<void>;
  playAgain(): Promise<void>;
  /* Quem é Mais Provável */
  endVoting(): Promise<void>;
  skipQuestion(): Promise<void>;
  endMatch(): Promise<void>;

  /* comandos de qualquer jogador */
  ackRole(): Promise<void>;
  castVote(targetId: PlayerId): Promise<void>;
  setPaused(paused: boolean): Promise<void>;
}

/** Ganchos de simulação — existem só no mock e alimentam o menu de dev. */
export interface RoomServiceDebug {
  simulateConnectionDrop(opts: { recover: boolean }): void;
  simulateHostLeft(): void;
  simulateNotEnoughPlayers(): void;
  simulatePlayerDisconnect(): void;
  hostAdvance(): void;
}

export function hasDebug(service: RoomService): service is RoomService & { debug: RoomServiceDebug } {
  return 'debug' in service;
}

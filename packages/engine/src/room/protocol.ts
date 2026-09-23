import type { CreateRoomInput, PlayerId, RoomErrorCode, RoomSnapshot } from '../types';

/**
 * Protocolo do WebSocket das salas. JSON, uma mensagem por frame.
 * Toda requisição do cliente leva um `id`; o servidor responde com `ack` do mesmo `id`.
 * O estado nunca vem na resposta: chega sempre como `snapshot`, já filtrado para quem recebe.
 */
export const PROTOCOL_VERSION = 1;

/** O que um jogador pode pedir à sala. O engine decide se pode (host, fase). */
export type RoomCommand =
  | { type: 'startMatch' }
  | { type: 'setTimerRunning'; running: boolean }
  | { type: 'resetTimer' }
  | { type: 'openVoting' }
  /** Quem é Mais Provável: host encerra a votação adiantado (precisa de ao menos um voto). */
  | { type: 'endVoting' }
  /** Quem é Mais Provável: troca a pergunta, só antes de a votação abrir. */
  | { type: 'skipQuestion' }
  /** Encerra uma partida sem limite de rodadas. */
  | { type: 'endMatch' }
  | { type: 'nextRound' }
  | { type: 'playAgain' }
  | { type: 'ackRole' }
  | { type: 'castVote'; targetId: PlayerId }
  | { type: 'setPaused'; paused: boolean };

/** Nome e cor vêm do perfil do app; o id do jogador vem SEMPRE do token, nunca da mensagem. */
export type PlayerAppearance = { name: string; color: string };

export type ClientMessage =
  /** Primeira mensagem obrigatória. `token` é o access token do Supabase. */
  | { t: 'hello'; v: number; token: string }
  | { t: 'create'; id: number; input: CreateRoomInput; me: PlayerAppearance }
  | { t: 'join'; id: number; code: string; me: PlayerAppearance }
  /** Volta para a sala em que já estava (reabriu o app, caiu a rede). */
  | { t: 'resume'; id: number; code: string }
  | { t: 'leave'; id: number }
  | { t: 'cmd'; id: number; cmd: RoomCommand }
  | { t: 'ping' };

export type ServerMessage =
  | { t: 'welcome'; playerId: PlayerId }
  | { t: 'ack'; id: number; ok: true }
  | { t: 'ack'; id: number; ok: false; error: RoomErrorCode }
  | { t: 'snapshot'; snapshot: RoomSnapshot | null }
  | { t: 'pong' }
  /** O servidor vai fechar a conexão (token inválido, outra sessão do mesmo usuário…). */
  | { t: 'bye'; reason: 'unauthenticated' | 'replaced' | 'protocol' | 'shutdown' };

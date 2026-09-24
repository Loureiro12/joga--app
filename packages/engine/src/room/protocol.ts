import type { CreateRoomInput, PlayerId, RoomErrorCode, RoomSnapshot } from '../types';

/**
 * Protocolo do WebSocket das salas. JSON, uma mensagem por frame.
 * Toda requisição do cliente leva um `id`; o servidor responde com `ack` do mesmo `id`.
 * O estado nunca vem na resposta: chega sempre como `snapshot`, já filtrado para quem recebe.
 */
/**
 * Sobe quando o formato das mensagens muda de um jeito que as pontas não conseguem conversar.
 * O servidor recusa quem não bate com um `bye protocol`, e é isso que evita o pior caso:
 * app novo contra servidor velho trocando snapshots que o outro lado interpreta errado em silêncio.
 *
 * 2 — `RoomSnapshot.round/secret/result/summary` viraram `RoomSnapshot.game`, por jogo (2026-09-22).
 */
export const PROTOCOL_VERSION = 2;

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
  | { type: 'setPaused'; paused: boolean }
  /* Desafio Secreto */
  /** "Li minha missão e escondi": a partida só começa quando todos confirmarem. */
  | { type: 'missionReady' }
  /** "Consegui." Fica em segredo até a hora da verdade. */
  | { type: 'missionDone' }
  /** Acusa alguém de estar cumprindo uma missão específica. */
  | { type: 'accuse'; targetId: PlayerId; missionId: string }
  /** Troca a missão que não cabe no rolê. Uma por pessoa. */
  | { type: 'swapMission' }
  /** Hora da verdade: host passa para o próximo. */
  | { type: 'nextReveal' }
  /** Hora da verdade: o grupo diz se a história valeu. */
  | { type: 'voteReveal'; valid: boolean }
  /* Casal Perfeito */
  /** Convida alguém para formar dupla — ou aceita, quando a pessoa já tinha convidado você (§7). */
  | { type: 'pairWith'; targetId: PlayerId }
  /** Desfaz o convite, ou a dupla já formada. */
  | { type: 'unpair' }
  /** Host: todo mundo tem par, podem começar as perguntas. */
  | { type: 'beginQuestions' }
  /** Responde a pergunta da rodada. Depois de enviada, não muda (§33). */
  | { type: 'submitAnswer'; value: string }
  /* Bomba-Relógio em sala */
  /** "Estou pronto": acende o próprio pavio. Só quem está com a bomba. */
  | { type: 'armBomb' }
  /** Passa a bomba adiante. A responsabilidade muda no toque. */
  | { type: 'passBomb' }
  /** Alfabeto: tocar a letra é o que passa a bomba. */
  | { type: 'useLetter'; letter: string };

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

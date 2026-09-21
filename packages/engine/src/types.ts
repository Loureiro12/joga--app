/**
 * Modelo de domínio da sala/partida. Espelha as entidades previstas para o backend
 * (rooms, players, rounds, votes, scores) — ver README do handoff, seção "Backend".
 * Nada aqui conhece React, Zustand ou o transporte (mock/Supabase/Firebase).
 */

export type PlayerId = string;

export type Player = {
  id: PlayerId;
  name: string;
  color: string;
  isHost: boolean;
  connected: boolean;
  joinedAt: number;
};

/**
 * Fase da sala. Só o host (ou o servidor) muda a fase; os clientes navegam a partir dela.
 * lobby → role_reveal → clues → voting → revealing → (role_reveal | finished) · closed
 */
export type RoomPhase = 'lobby' | 'role_reveal' | 'clues' | 'voting' | 'revealing' | 'finished' | 'closed';

export type ClosedReason = 'host_left' | 'not_enough_players';

export type Room = {
  code: string;
  hostId: PlayerId;
  gameId: string;
  category: string;
  totalRounds: number;
  maxPlayers: number;
  phase: RoomPhase;
  /** Rodada atual (1-based). 0 no lobby. */
  roundIndex: number;
  paused: boolean;
  closedReason?: ClosedReason;
};

/**
 * `remainingSec` vale no instante em que o snapshot foi emitido. O servidor NÃO manda um snapshot
 * por segundo: com `running: true`, o cliente faz a contagem local a partir do momento em que recebeu.
 */
export type RoundTimer = { durationSec: number; remainingSec: number; running: boolean };

/** Parte pública da rodada (todos veem). */
export type RoundPublic = {
  index: number;
  /**
   * Número do sorteio. Muda quando a MESMA rodada é sorteada de novo (alguém saiu no meio):
   * o cliente usa para esconder o papel antigo e pedir uma nova revelação.
   */
  deal: number;
  /** Categoria sorteada da rodada (difere de `room.category` quando a sala é "Aleatório"). */
  category: string;
  starterId: PlayerId;
  /** Ordem das pistas, começando pelo sorteado. */
  order: PlayerId[];
  /** Quem já viu o papel e tocou em "Entendi". A fase só avança quando todos os conectados confirmarem. */
  ackedIds: PlayerId[];
  timer: RoundTimer;
};

/** Parte secreta: cada cliente recebe só a sua. */
export type SecretRole = { role: 'word'; word: string; emoji: string } | { role: 'impostor' };

/** Votos ficam ocultos até `revealing`: só sabemos QUEM já votou. */
export type VoteProgress = { votedIds: PlayerId[]; total: number; myVote: PlayerId | null };

export type TallyEntry = { playerId: PlayerId; votes: number };

export type RoundResult = {
  /** Revelação em 3 tempos, sincronizada pelo servidor: 0 suspense · 1 escolhido · 2 desfecho. */
  stage: 0 | 1 | 2;
  chosenId: PlayerId;
  impostorId: PlayerId;
  caught: boolean;
  word: string;
  tally: TallyEntry[];
  pointsDelta: Record<PlayerId, number>;
  /** Destaque do card "Pontos da rodada". */
  headline: { points: number; target: 'group' | PlayerId };
};

export type Score = { playerId: PlayerId; points: number; lastDelta: number };

export type MatchSummary = { winnerId: PlayerId; impostorsCaught: number };

/** Foto completa do que ESTE cliente pode ver. É o único formato que as telas consomem. */
export type RoomSnapshot = {
  room: Room;
  players: Player[];
  meId: PlayerId;
  round: RoundPublic | null;
  secret: SecretRole | null;
  votes: VoteProgress | null;
  result: RoundResult | null;
  scores: Score[];
  summary: MatchSummary | null;
};

export type ConnectionState =
  | { status: 'online' }
  | { status: 'reconnecting'; secondsLeft: number; timeoutSec: number }
  | { status: 'failed' };

/**
 * O que QUALQUER pessoa com o código pode saber da sala (página de convite do site).
 * Nada secreto: sem ids, sem papel, sem votos, sem pontos — só o suficiente para o convite.
 */
export type RoomPublicInfo = {
  code: string;
  gameId: string;
  /** `open`: ainda dá para entrar · `playing`: partida em andamento · `finished`: acabou. */
  status: 'open' | 'playing' | 'finished';
  host: { name: string; initial: string; color: string };
  count: number;
  players: { initial: string; color: string }[];
};

/** Boletim de uma partida que chegou ao fim — o que vai para o histórico. */
export type MatchRecord = {
  /** Gerado no início da partida; torna a gravação idempotente (regravar não duplica). */
  matchId: string;
  roomCode: string;
  gameId: string;
  category: string;
  totalRounds: number;
  impostorsCaught: number;
  startedAt: number;
  endedAt: number;
  /** Só quem estava na sala no fim. Quem saiu no meio não ganha registro. */
  players: MatchRecordPlayer[];
};

export type MatchRecordPlayer = {
  playerId: PlayerId;
  name: string;
  color: string;
  /** Colocação com empate: 1, 1, 3… */
  position: number;
  points: number;
  /** 1º lugar; em empate no topo, todos os empatados vencem. */
  won: boolean;
  timesImpostor: number;
  /** Vezes em que foi impostor e o grupo não o pegou. */
  timesEscaped: number;
};

export type PlayerIdentity = { id: PlayerId; name: string; color: string };

export type CreateRoomInput = { gameId: string; category: string; totalRounds: number; maxPlayers: number };

export type RoomErrorCode =
  | 'room_not_found'
  | 'room_full'
  | 'match_in_progress'
  | 'not_enough_players'
  | 'not_host'
  | 'invalid_phase'
  | 'not_in_room'
  | 'bad_request'
  | 'rate_limited'
  | 'unauthenticated'
  /** Só no cliente: o servidor não respondeu a tempo. */
  | 'timeout';

export class RoomError extends Error {
  constructor(public readonly code: RoomErrorCode) {
    super(code);
    this.name = 'RoomError';
  }
}

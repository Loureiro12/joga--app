/**
 * Modelo de domínio da sala/partida. Espelha as entidades previstas para o backend
 * (rooms, players, rounds, votes, scores) — ver README do handoff, seção "Backend".
 * Nada aqui conhece React, Zustand ou o transporte (mock/Supabase/Firebase).
 */

// Só tipo: o `import type` é apagado na compilação, então o ciclo types ↔ likely-types não existe em runtime.
import type { LikelyIntensity, LikelySettings } from './games/likely-types';
import type { PerfectCouple, PerfectPairingView, PerfectResultView, PerfectRoundPublic, PerfectSettings, PerfectSummary } from './games/perfect-types';
import type { SecretContext, SecretHighlight, SecretMission, SecretReveal, SecretSettings, SecretStatus } from './games/secret-types';

export type PlayerId = string;

/** Jogos com fluxo de partida implementado. O catálogo do app tem outros, ainda "em breve". */
export type GameId = 'impostor' | 'likely' | 'secret' | 'perfect';

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
 * Impostor:  lobby → role_reveal → clues → voting → revealing → (role_reveal | finished) · closed
 * Provável:   lobby → question → voting → revealing → (question | finished) · closed
 *
 * As fases comuns (lobby, voting, revealing, finished, closed) valem para os dois; as outras
 * são de um jogo só. `room.gameId` diz qual jogo está em curso, e `RoomSnapshot.game` acompanha.
 */
export type RoomPhase =
  /** Comuns a todos os jogos. */
  | 'lobby'
  | 'voting'
  | 'revealing'
  | 'finished'
  | 'closed'
  /** Impostor: papel secreto, depois as pistas com cronômetro. */
  | 'role_reveal'
  | 'clues'
  /** Quem é Mais Provável: a pergunta na tela, antes de o host abrir a votação. */
  | 'question'
  /** Desafio Secreto: missões distribuídas, cada um revelando a sua escondido. */
  | 'briefing'
  /** Desafio Secreto: a noite correndo. O app praticamente some. */
  | 'mission'
  /** Desafio Secreto: a hora da verdade, um jogador por vez. */
  | 'verdict'
  /** Casal Perfeito: formando as duplas, antes de a primeira pergunta entrar. */
  | 'pairing'
  /** Casal Perfeito: todos respondendo em segredo, cada um no seu celular. */
  | 'answering';

export type ClosedReason = 'host_left' | 'not_enough_players';

export type Room = {
  code: string;
  hostId: PlayerId;
  gameId: GameId;
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

/** Parte pública da rodada do Impostor (todos veem). */
export type ImpostorRoundPublic = {
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

export type ImpostorRoundResult = {
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

export type ImpostorSummary = { winnerId: PlayerId; impostorsCaught: number };

/**
 * A parte da foto que é do jogo em curso, discriminada por `kind`. O que é de SALA
 * (jogadores, votos em andamento, placar) fica fora, porque vale para todos os jogos.
 */
export type GameView =
  | {
      kind: 'impostor';
      round: ImpostorRoundPublic | null;
      /** Só o papel de quem pediu o snapshot: o segredo nunca trafega para os outros. */
      secret: SecretRole | null;
      result: ImpostorRoundResult | null;
      summary: ImpostorSummary | null;
    }
  | {
      kind: 'secret';
      context: SecretContext;
      competitive: boolean;
      /** A própria missão e o próprio estado. Nunca a de outra pessoa. */
      mine: {
        mission: SecretMission;
        status: SecretStatus;
        accusationsLeft: number;
        swapsLeft: number;
        /** Alguém já desconfiou de mim — sem dizer quem. */
        suspected: boolean;
      } | null;
      /** Quem já leu e escondeu a própria missão. */
      ready: PlayerId[];
      /** Por alvo, as opções entre as quais se acusa. Vazio fora da noite. */
      accusationOptions: Record<PlayerId, SecretMission[]>;
      reveal: SecretReveal | null;
      revealProgress: { index: number; total: number } | null;
      summary: SecretSummary | null;
    }
  | {
      kind: 'likely';
      round: LikelyRoundPublic | null;
      result: LikelyResultView | null;
      summary: LikelySummary | null;
    }
  | {
      kind: 'perfect';
      /** Os casais da sala. Toda tela precisa: é por eles que o jogo fala, não por jogador. */
      couples: PerfectCouple[];
      myCoupleId: string | null;
      /** Só enquanto as duplas se formam. */
      pairing: PerfectPairingView | null;
      round: PerfectRoundPublic | null;
      /** A resposta deste jogador nesta rodada — nunca a do parceiro (§32). */
      myAnswer: string | null;
      result: PerfectResultView | null;
      summary: PerfectSummary | null;
    };

/** Foto completa do que ESTE cliente pode ver. É o único formato que as telas consomem. */
export type RoomSnapshot = {
  room: Room;
  players: Player[];
  meId: PlayerId;
  /** Quem já votou — nunca em quem. Vale para os dois jogos. */
  votes: VoteProgress | null;
  scores: Score[];
  game: GameView;
};

/* ------------------------------------------------------ Quem é Mais Provável? */

/** A pergunta da rodada. O prefixo "Quem é mais provável de..." é fixo e fica na tela. */
export type LikelyRoundPublic = {
  index: number;
  /** Total de rodadas, ou `null` quando a partida é sem limite. */
  totalRounds: number | null;
  questionId: string;
  question: string;
  category: string;
  intensity: 'leve' | 'moderado' | 'pesado';
  /** Em quem ESTE jogador pode votar (depende de o host permitir voto em si mesmo). */
  targets: PlayerId[];
  timer: RoundTimer | null;
};

/** Uma linha do "quem recebeu votos". `voterIds` vazio no modo secreto. */
export type LikelyTallyEntry = { playerId: PlayerId; votes: number; voterIds: PlayerId[] };

export type LikelyResultView = {
  /** Revelação em 3 tempos: 0 "todo mundo votou" · 1 contagem · 2 resultado completo. */
  stage: 0 | 1 | 2;
  /** Empate é resultado válido: mais de um vencedor, sem desempate automático. */
  winnerIds: PlayerId[];
  tally: LikelyTallyEntry[];
  totalVotes: number;
  eligibleCount: number;
  unanimous: boolean;
  /** Unanimidade em que o escolhido votou nele mesmo. */
  selfConfirmed: boolean;
  pointsDelta: Record<PlayerId, number>;
};

export type LikelySummary = {
  /** Quem o grupo mais escolheu na partida inteira. Vazio se ninguém recebeu voto. */
  mostChosenIds: PlayerId[];
  questions: number;
  votes: number;
  unanimities: number;
  ties: number;
  /** Frases marcantes da partida: "o grupo decidiu que Pedro é o mais provável de...". */
  highlights: { questionId: string; question: string; winnerIds: PlayerId[]; votes: number }[];
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

/** O fim do Desafio Secreto: quem cumpriu, quem foi pego, e os títulos da noite. */
export type SecretSummary = {
  players: { playerId: PlayerId; status: SecretStatus; points: number; caughtBy: PlayerId | null }[];
  highlights: SecretHighlight[];
};

export type PlayerIdentity = { id: PlayerId; name: string; color: string };

export type { LikelyIntensity, LikelySettings };
export * from './games/perfect-types';
export * from './games/secret-types';

/**
 * O que o host escolhe ao criar a sala. `totalRounds: 0` no "Quem é Mais Provável?" é a opção
 * sem limite. `settings` são as opções daquele jogo; o engine normaliza e ignora o que não conhece.
 */
export type CreateRoomInput = {
  gameId: GameId;
  category: string;
  totalRounds: number;
  maxPlayers: number;
  settings?: Partial<LikelySettings> & Partial<SecretSettings> & Partial<PerfectSettings>;
};

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

import {
  RoomError,
  type ClosedReason,
  type CreateRoomInput,
  type GameId,
  type MatchRecord,
  type Player,
  type PlayerId,
  type PlayerIdentity,
  type Room,
  type RoomPublicInfo,
  type RoomSnapshot,
  type Score,
} from '../types';

import type { GameCtx, GameRules } from './GameRules';
import { impostorGame, type ImpostorState } from './impostorGame';
import { likelyGame, type LikelyState } from './likelyGame';
import { bombGame, type RoomBombState } from './bombGame';
import { perfectGame, type PerfectState } from './perfectGame';
import { secretGame, type SecretState } from './secretGame';
import type { RoomCommand } from './protocol';

/**
 * A sala como máquina de estados: pura, síncrona e determinística.
 *
 * - Não conhece rede, banco nem bots. Quem hospeda (servidor WebSocket, mock do app, um Durable Object)
 *   injeta o relógio e reage ao `onChange` mandando `snapshotFor(jogador)` para cada um.
 * - Todo prazo (revelação em 3 tempos, cronômetro, tolerância de reconexão…) é um carimbo de tempo
 *   no estado. Existe UM alarme, sempre armado para o prazo mais próximo — por isso o estado pode ser
 *   salvo e restaurado em outro processo sem perder nenhum timer.
 * - Segredo por construção: `snapshotFor` só inclui o que AQUELE jogador pode ver, e o resultado
 *   da votação só sai completo no último tempo da revelação.
 *
 * O que é de SALA mora aqui: quem entrou, quem caiu, migração de host, alarme, salvar/restaurar.
 * O que é de PARTIDA mora em um `GameRules` (ver `GameRules.ts`) — um por jogo.
 */

export type EngineConfig = {
  revealStage1Ms: number;
  revealStage2Ms: number;
  /** Respiro entre "todos votaram" e o início da revelação. */
  allVotedPauseMs: number;
  /** Quanto um jogador desconectado mantém a vaga antes de ser removido. */
  graceMs: number;
  /** Se alguém nunca confirmar que viu o papel, a rodada segue mesmo assim. */
  ackTimeoutMs: number;
};

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  revealStage1Ms: 1600,
  revealStage2Ms: 3300,
  allVotedPauseMs: 900,
  graceMs: 30_000,
  ackTimeoutMs: 60_000,
};

export type Scheduler = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export const realScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

type EnginePlayer = Player & { disconnectedAt: number | null };

/** Estado de um jogo, discriminado pelo `gameId` da sala. */
export type GameState = ImpostorState | LikelyState | SecretState | PerfectState | RoomBombState;

/** Tudo que é preciso para recriar a sala em outro processo. JSON puro. */
export type EngineState = {
  room: Room;
  players: EnginePlayer[];
  scores: Record<PlayerId, Score>;
  /** Identidade e início da partida em curso; `null` no lobby. */
  matchId: string | null;
  matchStartedAt: number | null;
  matchEndedAt: number | null;
  lastActivityAt: number;
  /** A partida em si. Quem entende deste campo é o `GameRules` do jogo. */
  game: GameState;
};

export type RoomEngineDeps = {
  scheduler?: Scheduler;
  rng?: () => number;
  config?: Partial<EngineConfig>;
  /** Chamado uma vez por mutação (ou por alarme que mudou algo). */
  onChange?: () => void;
};

/** Os jogos com partida implementada. O catálogo do app tem outros, ainda "em breve". */
const GAMES: Record<GameId, GameRules<never>> = {
  impostor: impostorGame as GameRules<never>,
  likely: likelyGame as GameRules<never>,
  secret: secretGame as GameRules<never>,
  perfect: perfectGame as GameRules<never>,
  bomb: bombGame as GameRules<never>,
};

export const rulesFor = (gameId: GameId): GameRules<never> => GAMES[gameId] ?? GAMES.impostor;

/** Comandos que a sala trata sozinha, antes de chegar ao jogo. */
const ROOM_COMMANDS = new Set<RoomCommand['type']>(['startMatch', 'playAgain']);

const newScore = (playerId: PlayerId): Score => ({ playerId, points: 0, lastDelta: 0 });

export class RoomEngine {
  private state: EngineState;
  private readonly scheduler: Scheduler;
  private readonly rng: () => number;
  private readonly config: EngineConfig;
  private readonly onChange: () => void;
  private readonly game: GameRules<never>;
  private alarm: unknown = null;
  private disposed = false;

  private constructor(state: EngineState, deps: RoomEngineDeps) {
    this.state = state;
    this.scheduler = deps.scheduler ?? realScheduler;
    this.rng = deps.rng ?? Math.random;
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...deps.config };
    this.onChange = deps.onChange ?? (() => {});
    this.game = rulesFor(state.room.gameId);
  }

  static create(code: string, input: CreateRoomInput, host: PlayerIdentity, deps: RoomEngineDeps = {}): RoomEngine {
    const now = (deps.scheduler ?? realScheduler).now();
    const rules = rulesFor(input.gameId);
    const room: Room = { code, hostId: host.id, ...input, phase: 'lobby', roundIndex: 0, paused: false };
    const players: EnginePlayer[] = [{ ...host, isHost: true, connected: true, joinedAt: now, disconnectedAt: null }];
    const scores = { [host.id]: newScore(host.id) };
    const ctx: GameCtx = { room, players, scores, now, rng: deps.rng ?? Math.random, config: { ...DEFAULT_ENGINE_CONFIG, ...deps.config } };
    const engine = new RoomEngine(
      {
        room,
        players,
        scores,
        matchId: null,
        matchStartedAt: null,
        matchEndedAt: null,
        lastActivityAt: now,
        game: rules.initial(input, ctx) as GameState,
      },
      deps,
    );
    engine.arm();
    return engine;
  }

  /** Recria a sala a partir de um estado salvo; prazos vencidos durante a parada disparam em seguida. */
  static restore(state: EngineState, deps: RoomEngineDeps = {}): RoomEngine {
    const copy = JSON.parse(JSON.stringify(state)) as EngineState;
    // Estado salvo por uma versão anterior do servidor pode não ter os campos mais novos.
    const engine = new RoomEngine(Object.assign({ matchId: null, matchStartedAt: null, matchEndedAt: null }, copy), deps);
    engine.state.game = engine.game.hydrate(copy.game as never) as GameState;
    engine.arm();
    return engine;
  }

  serialize(): EngineState {
    return JSON.parse(JSON.stringify(this.state)) as EngineState;
  }

  /* ---------------------------------------------------------------- leitura */

  get code() {
    return this.state.room.code;
  }
  get phase() {
    return this.state.room.phase;
  }
  get hostId() {
    return this.state.room.hostId;
  }
  get playerIds(): PlayerId[] {
    return this.state.players.map((p) => p.id);
  }
  get isEmpty() {
    return this.state.players.length === 0;
  }
  get lastActivityAt() {
    return this.state.lastActivityAt;
  }
  has(playerId: PlayerId) {
    return this.state.players.some((p) => p.id === playerId);
  }

  snapshotFor(playerId: PlayerId): RoomSnapshot {
    const s = this.state;
    const ctx = this.ctx();
    const present = new Set(s.players.map((p) => p.id));
    return {
      room: { ...s.room },
      players: s.players.map(({ disconnectedAt: _ignored, ...player }) => player),
      meId: playerId,
      votes: this.game.voteProgress(s.game as never, ctx, playerId),
      scores: Object.values(s.scores)
        .filter((score) => present.has(score.playerId))
        .sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId)),
      game: this.game.viewFor(s.game as never, ctx, playerId),
    };
  }

  publicInfo(): RoomPublicInfo | null {
    const s = this.state;
    const host = s.players.find((p) => p.id === s.room.hostId);
    if (!host || s.room.phase === 'closed') return null;
    const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase();
    return {
      code: s.room.code,
      gameId: s.room.gameId,
      status: s.room.phase === 'lobby' ? 'open' : s.room.phase === 'finished' ? 'finished' : 'playing',
      host: { name: host.name, initial: initial(host.name), color: host.color },
      count: s.players.length,
      players: s.players.map((p) => ({ initial: initial(p.name), color: p.color })),
    };
  }

  /**
   * Boletim da partida, disponível só quando ela chegou ao fim (`finished`).
   * Partida abandonada ou fechada por falta de gente não gera boletim.
   */
  matchRecord(): MatchRecord | null {
    const s = this.state;
    if (s.room.phase !== 'finished' || !s.matchId || s.matchStartedAt === null) return null;
    const extras = this.game.recordExtras(s.game as never);
    const ranked = s.players
      .map((p) => ({ player: p, points: s.scores[p.id]?.points ?? 0 }))
      .sort((a, b) => b.points - a.points || a.player.joinedAt - b.player.joinedAt);
    return {
      matchId: s.matchId,
      roomCode: s.room.code,
      gameId: s.room.gameId,
      category: s.room.category,
      totalRounds: s.room.roundIndex,
      impostorsCaught: extras.impostorsCaught,
      startedAt: s.matchStartedAt,
      endedAt: s.matchEndedAt ?? this.scheduler.now(),
      players: ranked.map(({ player, points }) => {
        // Colocação "de competição": quem empata divide a posição, e a seguinte é pulada (1, 1, 3).
        const position = 1 + ranked.filter((other) => other.points > points).length;
        const role = extras.perPlayer[player.id] ?? { timesImpostor: 0, timesEscaped: 0 };
        return { playerId: player.id, name: player.name, color: player.color, position, points, won: position === 1, ...role };
      }),
    };
  }

  /* ------------------------------------------------------------ participação */

  /** Entra na sala. Se o jogador já está nela (reabriu o app, trocou de rede), apenas reconecta. */
  join(identity: PlayerIdentity): void {
    const s = this.state;
    const existing = s.players.find((p) => p.id === identity.id);
    if (existing) {
      existing.name = identity.name;
      existing.color = identity.color;
      return this.setConnected(identity.id, true);
    }
    if (s.room.phase === 'closed') throw new RoomError('room_not_found');
    if (s.room.phase !== 'lobby') throw new RoomError('match_in_progress');
    if (s.players.length >= s.room.maxPlayers) throw new RoomError('room_full');
    s.players.push({ ...identity, isHost: false, connected: true, joinedAt: this.scheduler.now(), disconnectedAt: null });
    s.scores[identity.id] ??= newScore(identity.id);
    this.changed();
  }

  /** Saída voluntária: sem tolerância, a vaga é liberada na hora. */
  leave(playerId: PlayerId): void {
    if (!this.has(playerId)) return;
    this.removePlayer(playerId);
    this.changed();
  }

  /** Queda ou volta da conexão. Quem cai mantém a vaga (e os pontos) por `graceMs`. */
  setConnected(playerId: PlayerId, connected: boolean): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.connected === connected) return;
    player.connected = connected;
    player.disconnectedAt = connected ? null : this.scheduler.now();
    // Quem caiu deixa de ser esperado: a rodada não trava por causa de um celular sem sinal.
    this.game.recheck(this.state.game as never, this.ctx());
    this.changed();
  }

  /* ---------------------------------------------------------------- comandos */

  dispatch(playerId: PlayerId, command: RoomCommand): void {
    const s = this.state;
    if (!this.has(playerId)) throw new RoomError('not_in_room');
    const hostOnly = ROOM_COMMANDS.has(command.type) || this.game.hostCommands.has(command.type);
    if (hostOnly && s.room.hostId !== playerId) throw new RoomError('not_host');
    const ctx = this.ctx();

    switch (command.type) {
      case 'startMatch': {
        if (s.room.phase !== 'lobby') throw new RoomError('invalid_phase');
        if (s.players.filter((p) => p.connected).length < this.game.minPlayers) throw new RoomError('not_enough_players');
        s.matchId = this.newId();
        s.matchStartedAt = ctx.now;
        s.matchEndedAt = null;
        this.game.startMatch(s.game as never, ctx);
        break;
      }
      case 'playAgain': {
        if (s.room.phase !== 'finished') throw new RoomError('invalid_phase');
        s.scores = Object.fromEntries(s.players.map((p) => [p.id, newScore(p.id)]));
        s.matchId = null;
        s.matchStartedAt = null;
        s.matchEndedAt = null;
        this.game.reset(s.game as never, ctx);
        s.room.phase = 'lobby';
        s.room.roundIndex = 0;
        s.room.paused = false;
        break;
      }
      default: {
        if (s.room.phase === 'lobby' || s.room.phase === 'closed') throw new RoomError('invalid_phase');
        this.game.dispatch(s.game as never, ctx, playerId, command);
      }
    }
    // O jogo pode ter acabado agora: carimba o fim para o boletim.
    if (s.room.phase === 'finished' && s.matchEndedAt === null) s.matchEndedAt = ctx.now;
    this.changed();
  }

  /** Para o alarme. Chame ao descartar a sala. */
  dispose(): void {
    this.disposed = true;
    if (this.alarm !== null) this.scheduler.clearTimeout(this.alarm);
    this.alarm = null;
  }

  /* ------------------------------------------------------------------ interno */

  private ctx(): GameCtx {
    const s = this.state;
    return { room: s.room, players: s.players, scores: s.scores, now: this.scheduler.now(), rng: this.rng, config: this.config };
  }

  /** UUID v4 a partir do `rng` injetado: o engine não pode depender de `crypto` (o Hermes não tem). */
  private newId(): string {
    const hex = (n: number) => Array.from({ length: n }, () => Math.floor(this.rng() * 16).toString(16)).join('');
    return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(this.rng() * 4)]}${hex(3)}-${hex(12)}`;
  }

  private removePlayer(playerId: PlayerId): void {
    const s = this.state;
    s.players = s.players.filter((p) => p.id !== playerId);
    if (s.players.length === 0) return;

    if (s.room.hostId === playerId) {
      // Migração de host: assume quem está na sala há mais tempo, de preferência alguém conectado.
      const byArrival = [...s.players].sort((a, b) => a.joinedAt - b.joinedAt);
      const next = byArrival.find((p) => p.connected) ?? byArrival[0];
      s.room.hostId = next.id;
      s.players = s.players.map((p) => ({ ...p, isHost: p.id === next.id }));
    }

    const phase = s.room.phase;
    if (phase === 'lobby' || phase === 'finished' || phase === 'closed') return;
    if (s.players.length < this.game.minPlayers) return this.close('not_enough_players');
    this.game.playerRemoved(s.game as never, this.ctx(), playerId);
  }

  private close(reason: ClosedReason): void {
    const s = this.state;
    s.room.phase = 'closed';
    s.room.closedReason = reason;
    s.room.paused = false;
  }

  /* ------------------------------------------------------------------ alarme */

  /** Aplica tudo que venceu até `now`. Devolve se algo mudou. */
  /** Quanto tempo quem caiu mantém a vaga. O jogo pode esticar (ver `GameRules.roomConfig`). */
  private get graceMs(): number {
    return this.game.roomConfig?.graceMs ?? this.config.graceMs;
  }

  /** Quanto a sala sobrevive sem ninguém conectado. Quem descarta é o servidor. */
  get idleRoomMs(): number | undefined {
    return this.game.roomConfig?.idleRoomMs;
  }

  private runDue(now: number): boolean {
    const s = this.state;
    let changed = false;

    for (let guard = 0; guard < 50; guard++) {
      const expired = s.players.find((p) => p.disconnectedAt !== null && p.disconnectedAt + this.graceMs <= now);
      let fired = false;
      if (expired) {
        this.removePlayer(expired.id);
        fired = true;
      } else {
        fired = this.game.step(s.game as never, this.ctx());
      }
      if (!fired) break;
      changed = true;
      if (s.room.phase === 'finished' && s.matchEndedAt === null) s.matchEndedAt = now;
      this.game.recheck(s.game as never, this.ctx());
    }
    return changed;
  }

  private nextDeadline(): number | null {
    const s = this.state;
    const deadlines: number[] = [];
    for (const p of s.players) if (p.disconnectedAt !== null) deadlines.push(p.disconnectedAt + this.graceMs);
    deadlines.push(...this.game.deadlines(s.game as never, this.ctx()));
    return deadlines.length ? Math.min(...deadlines) : null;
  }

  private arm(): void {
    if (this.alarm !== null) this.scheduler.clearTimeout(this.alarm);
    this.alarm = null;
    if (this.disposed) return;
    const deadline = this.nextDeadline();
    if (deadline === null) return;
    this.alarm = this.scheduler.setTimeout(
      () => {
        this.alarm = null;
        if (this.disposed) return;
        const mutated = this.runDue(this.scheduler.now());
        this.arm();
        if (mutated) this.onChange();
      },
      Math.max(0, deadline - this.scheduler.now()),
    );
  }

  private changed(): void {
    this.state.lastActivityAt = this.scheduler.now();
    this.arm();
    this.onChange();
  }
}

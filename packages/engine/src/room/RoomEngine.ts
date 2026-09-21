import { IMPOSTOR_RULES, createImpostorRound, resolveImpostorRound, type ImpostorRound } from '../games/impostor';
import {
  RoomError,
  type ClosedReason,
  type CreateRoomInput,
  type Player,
  type PlayerId,
  type PlayerIdentity,
  type Room,
  type RoomSnapshot,
  type RoundResult,
  type Score,
} from '../types';
import type { RoomCommand } from './protocol';

/**
 * A sala como máquina de estados: pura, síncrona e determinística.
 *
 * - Não conhece rede, banco nem bots. Quem hospeda (servidor WebSocket, mock do app, um Durable Object)
 *   injeta o relógio e reage ao `onChange` mandando `snapshotFor(jogador)` para cada um.
 * - Todo prazo (revelação em 3 tempos, cronômetro, tolerância de reconexão…) é um carimbo de tempo
 *   no estado. Existe UM alarme, sempre armado para o prazo mais próximo — por isso o estado pode ser
 *   salvo e restaurado em outro processo sem perder nenhum timer.
 * - Segredo por construção: `snapshotFor` só inclui o papel de quem pediu, e o resultado da votação
 *   só sai completo no último tempo da revelação.
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

/** Tudo que é preciso para recriar a sala em outro processo. JSON puro. */
export type EngineState = {
  room: Room;
  players: EnginePlayer[];
  round: ImpostorRound | null;
  /** Conta os sorteios da partida; ver `RoundPublic.deal`. */
  deal: number;
  roundStartedAt: number | null;
  ackedIds: PlayerId[];
  timer: { remainingMs: number; endsAt: number | null };
  votes: Record<PlayerId, PlayerId>;
  allVotedAt: number | null;
  result: Omit<RoundResult, 'stage'> | null;
  revealStartedAt: number | null;
  stage: 0 | 1 | 2;
  scores: Record<PlayerId, Score>;
  usedWords: string[];
  impostorsCaught: number;
  lastActivityAt: number;
};

export type RoomEngineDeps = {
  scheduler?: Scheduler;
  rng?: () => number;
  config?: Partial<EngineConfig>;
  /** Chamado uma vez por mutação (ou por alarme que mudou algo). */
  onChange?: () => void;
};

const HOST_COMMANDS = new Set<RoomCommand['type']>(['startMatch', 'setTimerRunning', 'resetTimer', 'openVoting', 'nextRound', 'playAgain']);
const ROUND_MS = IMPOSTOR_RULES.roundSeconds * 1000;
const newScore = (playerId: PlayerId): Score => ({ playerId, points: 0, lastDelta: 0 });

export class RoomEngine {
  private state: EngineState;
  private readonly scheduler: Scheduler;
  private readonly rng: () => number;
  private readonly config: EngineConfig;
  private readonly onChange: () => void;
  private alarm: unknown = null;
  private disposed = false;

  private constructor(state: EngineState, deps: RoomEngineDeps) {
    this.state = state;
    this.scheduler = deps.scheduler ?? realScheduler;
    this.rng = deps.rng ?? Math.random;
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...deps.config };
    this.onChange = deps.onChange ?? (() => {});
  }

  static create(code: string, input: CreateRoomInput, host: PlayerIdentity, deps: RoomEngineDeps = {}): RoomEngine {
    const now = (deps.scheduler ?? realScheduler).now();
    const engine = new RoomEngine(
      {
        room: { code, hostId: host.id, ...input, phase: 'lobby', roundIndex: 0, paused: false },
        players: [{ ...host, isHost: true, connected: true, joinedAt: now, disconnectedAt: null }],
        round: null,
        deal: 0,
        roundStartedAt: null,
        ackedIds: [],
        timer: { remainingMs: ROUND_MS, endsAt: null },
        votes: {},
        allVotedAt: null,
        result: null,
        revealStartedAt: null,
        stage: 0,
        scores: { [host.id]: newScore(host.id) },
        usedWords: [],
        impostorsCaught: 0,
        lastActivityAt: now,
      },
      deps,
    );
    engine.arm();
    return engine;
  }

  /** Recria a sala a partir de um estado salvo; prazos vencidos durante a parada disparam em seguida. */
  static restore(state: EngineState, deps: RoomEngineDeps = {}): RoomEngine {
    const engine = new RoomEngine(JSON.parse(JSON.stringify(state)) as EngineState, deps);
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
    const now = this.scheduler.now();
    const connected = s.players.filter((p) => p.connected);
    const present = new Set(s.players.map((p) => p.id));
    const scores = Object.values(s.scores)
      .filter((score) => present.has(score.playerId))
      .sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId));
    const inRound = s.round !== null && s.room.phase !== 'lobby';
    const remainingMs = s.timer.endsAt !== null ? Math.max(0, s.timer.endsAt - now) : s.timer.remainingMs;

    return {
      room: { ...s.room },
      players: s.players.map(({ disconnectedAt: _ignored, ...player }) => player),
      meId: playerId,
      round: inRound
        ? {
            index: s.room.roundIndex,
            deal: s.deal,
            category: s.round!.category,
            starterId: s.round!.order[0],
            order: [...s.round!.order],
            ackedIds: [...s.ackedIds],
            timer: { durationSec: IMPOSTOR_RULES.roundSeconds, remainingSec: Math.ceil(remainingMs / 1000), running: s.timer.endsAt !== null },
          }
        : null,
      secret: inRound
        ? s.round!.impostorId === playerId
          ? { role: 'impostor' }
          : { role: 'word', word: s.round!.word.word, emoji: s.round!.word.emoji }
        : null,
      votes:
        s.room.phase === 'voting' || s.room.phase === 'revealing'
          ? { votedIds: Object.keys(s.votes), total: connected.length, myVote: s.votes[playerId] ?? null }
          : null,
      result: s.room.phase === 'revealing' && s.result ? this.maskedResult(s.result, s.stage) : null,
      scores,
      summary: s.room.phase === 'finished' && scores[0] ? { winnerId: scores[0].playerId, impostorsCaught: s.impostorsCaught } : null,
    };
  }

  /** Nada do desfecho sai antes da hora: tempo 0 = suspense, tempo 1 = só o escolhido, tempo 2 = tudo. */
  private maskedResult(result: Omit<RoundResult, 'stage'>, stage: 0 | 1 | 2): RoundResult {
    if (stage === 2) return { ...result, stage };
    return {
      stage,
      chosenId: stage === 1 ? result.chosenId : '',
      impostorId: '',
      caught: false,
      word: '',
      tally: [],
      pointsDelta: {},
      headline: { points: 0, target: 'group' },
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
    this.checkAcks();
    this.checkVotes();
    this.changed();
  }

  /* ---------------------------------------------------------------- comandos */

  dispatch(playerId: PlayerId, command: RoomCommand): void {
    const s = this.state;
    if (!this.has(playerId)) throw new RoomError('not_in_room');
    if (HOST_COMMANDS.has(command.type) && s.room.hostId !== playerId) throw new RoomError('not_host');
    const phase = s.room.phase;
    const now = this.scheduler.now();

    switch (command.type) {
      case 'startMatch': {
        if (phase !== 'lobby') throw new RoomError('invalid_phase');
        if (s.players.filter((p) => p.connected).length < IMPOSTOR_RULES.minPlayers) throw new RoomError('not_enough_players');
        this.beginRound(1);
        break;
      }
      case 'ackRole': {
        if (phase !== 'role_reveal') return;
        if (!s.ackedIds.includes(playerId)) s.ackedIds.push(playerId);
        this.checkAcks();
        break;
      }
      case 'setTimerRunning': {
        if (phase !== 'clues') throw new RoomError('invalid_phase');
        if (command.running) {
          if (s.room.paused || s.timer.endsAt !== null || s.timer.remainingMs <= 0) return;
          s.timer.endsAt = now + s.timer.remainingMs;
        } else {
          this.stopTimer();
        }
        break;
      }
      case 'resetTimer': {
        if (phase !== 'clues') throw new RoomError('invalid_phase');
        s.timer = { remainingMs: ROUND_MS, endsAt: null };
        break;
      }
      case 'openVoting': {
        if (phase !== 'clues') throw new RoomError('invalid_phase');
        this.stopTimer();
        s.votes = {};
        s.allVotedAt = null;
        s.room.phase = 'voting';
        s.room.paused = false;
        break;
      }
      case 'castVote': {
        if (phase !== 'voting') throw new RoomError('invalid_phase');
        if (s.votes[playerId]) return; // voto é voto
        if (command.targetId === playerId || !this.has(command.targetId)) throw new RoomError('bad_request');
        s.votes[playerId] = command.targetId;
        this.checkVotes();
        break;
      }
      case 'nextRound': {
        if (phase !== 'revealing' || s.stage !== 2) throw new RoomError('invalid_phase');
        if (s.room.roundIndex >= s.room.totalRounds) s.room.phase = 'finished';
        else this.beginRound(s.room.roundIndex + 1);
        break;
      }
      case 'playAgain': {
        if (phase !== 'finished') throw new RoomError('invalid_phase');
        s.scores = Object.fromEntries(s.players.map((p) => [p.id, newScore(p.id)]));
        s.usedWords = [];
        s.impostorsCaught = 0;
        this.clearRound();
        s.room.phase = 'lobby';
        s.room.roundIndex = 0;
        s.room.paused = false;
        break;
      }
      case 'setPaused': {
        if (phase === 'lobby' || phase === 'finished' || phase === 'closed') throw new RoomError('invalid_phase');
        if (command.paused) this.stopTimer();
        s.room.paused = command.paused;
        break;
      }
    }
    this.changed();
  }

  /** Para o alarme. Chame ao descartar a sala. */
  dispose(): void {
    this.disposed = true;
    if (this.alarm !== null) this.scheduler.clearTimeout(this.alarm);
    this.alarm = null;
  }

  /* --------------------------------------------------------------- transições */

  private beginRound(index: number): void {
    const s = this.state;
    const round = createImpostorRound(s.players, s.room.category, new Set(s.usedWords), this.rng);
    s.usedWords.push(round.word.word);
    this.clearRound();
    s.round = round;
    s.deal += 1;
    s.roundStartedAt = this.scheduler.now();
    s.room.phase = 'role_reveal';
    s.room.roundIndex = index;
    s.room.paused = false;
  }

  private clearRound(): void {
    const s = this.state;
    s.round = null;
    s.roundStartedAt = null;
    s.ackedIds = [];
    s.timer = { remainingMs: ROUND_MS, endsAt: null };
    s.votes = {};
    s.allVotedAt = null;
    s.result = null;
    s.revealStartedAt = null;
    s.stage = 0;
  }

  private stopTimer(): void {
    const { timer } = this.state;
    if (timer.endsAt === null) return;
    timer.remainingMs = Math.max(0, timer.endsAt - this.scheduler.now());
    timer.endsAt = null;
  }

  private checkAcks(): void {
    const s = this.state;
    if (s.room.phase !== 'role_reveal') return;
    const waitingFor = s.players.filter((p) => p.connected && !s.ackedIds.includes(p.id));
    if (waitingFor.length === 0) s.room.phase = 'clues';
  }

  private checkVotes(): void {
    const s = this.state;
    if (s.room.phase !== 'voting' || s.allVotedAt !== null) return;
    const connected = s.players.filter((p) => p.connected);
    if (connected.length > 0 && connected.every((p) => s.votes[p.id])) s.allVotedAt = this.scheduler.now();
  }

  private startReveal(): void {
    const s = this.state;
    if (!s.round) return;
    s.result = resolveImpostorRound(s.round, s.votes, s.players);
    s.revealStartedAt = this.scheduler.now();
    s.stage = 0;
    s.room.phase = 'revealing';
    s.room.paused = false;
  }

  /** Os pontos só entram no placar junto com o desfecho, para o placar não entregar o resultado antes. */
  private applyScores(): void {
    const s = this.state;
    if (!s.result) return;
    if (s.result.caught) s.impostorsCaught += 1;
    for (const player of s.players) {
      const delta = s.result.pointsDelta[player.id] ?? 0;
      const previous = s.scores[player.id] ?? newScore(player.id);
      s.scores[player.id] = { playerId: player.id, points: previous.points + delta, lastDelta: delta };
    }
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
    const midMatch = phase === 'role_reveal' || phase === 'clues' || phase === 'voting' || phase === 'revealing';
    if (!midMatch) return;
    if (s.players.length < IMPOSTOR_RULES.minPlayers) return this.close('not_enough_players');
    // Ordem, impostor e votos referenciam quem saiu: a rodada é sorteada de novo, com o mesmo número.
    if (phase !== 'revealing') this.beginRound(s.room.roundIndex);
  }

  private close(reason: ClosedReason): void {
    const s = this.state;
    this.stopTimer();
    s.room.phase = 'closed';
    s.room.closedReason = reason;
    s.room.paused = false;
  }

  /* ------------------------------------------------------------------ alarme */

  /** Aplica tudo que venceu até `now`. Devolve se algo mudou. */
  private runDue(now: number): boolean {
    const s = this.state;
    const { config } = this;
    let changed = false;

    for (let guard = 0; guard < 50; guard++) {
      let fired = false;

      const expired = s.players.find((p) => p.disconnectedAt !== null && p.disconnectedAt + config.graceMs <= now);
      if (expired) {
        this.removePlayer(expired.id);
        fired = true;
      } else if (s.room.phase === 'role_reveal' && s.roundStartedAt !== null && s.roundStartedAt + config.ackTimeoutMs <= now) {
        s.room.phase = 'clues';
        fired = true;
      } else if (s.room.phase === 'clues' && s.timer.endsAt !== null && s.timer.endsAt <= now) {
        s.timer = { remainingMs: 0, endsAt: null };
        fired = true;
      } else if (s.room.phase === 'voting' && s.allVotedAt !== null && s.allVotedAt + config.allVotedPauseMs <= now) {
        this.startReveal();
        fired = true;
      } else if (s.room.phase === 'revealing' && s.revealStartedAt !== null) {
        if (s.stage === 0 && s.revealStartedAt + config.revealStage1Ms <= now) {
          s.stage = 1;
          fired = true;
        } else if (s.stage === 1 && s.revealStartedAt + config.revealStage2Ms <= now) {
          s.stage = 2;
          this.applyScores();
          fired = true;
        }
      }

      if (!fired) break;
      changed = true;
      this.checkAcks();
      this.checkVotes();
    }
    return changed;
  }

  private nextDeadline(): number | null {
    const s = this.state;
    const { config } = this;
    const deadlines: number[] = [];
    for (const p of s.players) if (p.disconnectedAt !== null) deadlines.push(p.disconnectedAt + config.graceMs);
    if (s.room.phase === 'role_reveal' && s.roundStartedAt !== null) deadlines.push(s.roundStartedAt + config.ackTimeoutMs);
    if (s.room.phase === 'clues' && s.timer.endsAt !== null) deadlines.push(s.timer.endsAt);
    if (s.room.phase === 'voting' && s.allVotedAt !== null) deadlines.push(s.allVotedAt + config.allVotedPauseMs);
    if (s.room.phase === 'revealing' && s.revealStartedAt !== null) {
      if (s.stage === 0) deadlines.push(s.revealStartedAt + config.revealStage1Ms);
      if (s.stage === 1) deadlines.push(s.revealStartedAt + config.revealStage2Ms);
    }
    return deadlines.length ? Math.min(...deadlines) : null;
  }

  private arm(): void {
    if (this.alarm !== null) this.scheduler.clearTimeout(this.alarm);
    this.alarm = null;
    if (this.disposed) return;
    const deadline = this.nextDeadline();
    if (deadline === null) return;
    this.alarm = this.scheduler.setTimeout(() => {
      this.alarm = null;
      if (this.disposed) return;
      const mutated = this.runDue(this.scheduler.now());
      this.arm();
      if (mutated) this.onChange();
    }, Math.max(0, deadline - this.scheduler.now()));
  }

  private changed(): void {
    this.state.lastActivityAt = this.scheduler.now();
    this.arm();
    this.onChange();
  }
}

import { wait } from '@/core/utils/format';

import {
  RoomError,
  type ConnectionState,
  type CreateRoomInput,
  type Player,
  type PlayerId,
  type PlayerIdentity,
  type Room,
  type RoomSnapshot,
  type RoundResult,
  type Score,
  IMPOSTOR_RULES,
  botVote,
  createImpostorRound,
  resolveImpostorRound,
  type ImpostorRound,
} from '@jogae/engine';

import type { RoomService, RoomServiceDebug, Unsubscribe } from './RoomService';

/** Timings da simulação (README, "Fase 1"). Ajustáveis para testes. */
export type MockRoomConfig = {
  latencyMs: number;
  botJoinEveryMs: number;
  botVoteEveryMs: number;
  allVotedPauseMs: number;
  revealStage1Ms: number;
  revealStage2Ms: number;
  reconnectMs: number;
  reconnectTimeoutSec: number;
  /** Quando o host é um bot (você entrou como convidado). */
  botHostStartMs: number;
  botHostOpenVotingMs: number;
  botHostNextRoundMs: number;
};

export const DEFAULT_MOCK_CONFIG: MockRoomConfig = {
  latencyMs: 900,
  botJoinEveryMs: 900,
  botVoteEveryMs: 1100,
  allVotedPauseMs: 900,
  revealStage1Ms: 1600,
  revealStage2Ms: 3300,
  reconnectMs: 6000,
  reconnectTimeoutSec: 30,
  botHostStartMs: 1800,
  botHostOpenVotingMs: 12000,
  botHostNextRoundMs: 9000,
};

/** Única sala "existente" no mock; qualquer outro código dá "Sala não encontrada". */
export const MOCK_JOINABLE_CODE = '4827';

const BOTS: { name: string; color: string }[] = [
  { name: 'André', color: '#7C3AED' },
  { name: 'Carol', color: '#FACC15' },
  { name: 'Lucas', color: '#22C55E' },
  { name: 'Pedro', color: '#A78BFA' },
  { name: 'João', color: '#EF4444' },
  { name: 'Bia', color: '#27272F' },
  { name: 'Rafa', color: '#FACC15' },
  { name: 'Mari', color: '#22C55E' },
  { name: 'Duda', color: '#A78BFA' },
  { name: 'Léo', color: '#EF4444' },
  { name: 'Nina', color: '#7C3AED' },
];

type State = {
  room: Room;
  players: Player[];
  meId: PlayerId;
  round: ImpostorRound | null;
  timer: { remainingSec: number; running: boolean };
  votes: Record<PlayerId, PlayerId>;
  result: RoundResult | null;
  scores: Record<PlayerId, Score>;
  usedWords: Set<string>;
  impostorsCaught: number;
  pendingBots: { name: string; color: string }[];
};

/**
 * "Servidor" em memória: aplica as regras de verdade (sorteio, votos, pontuação)
 * e simula os outros jogadores com bots. Implementa `RoomService` — trocar por
 * Supabase/Firebase é criar outra classe com a mesma interface.
 */
export class MockRoomService implements RoomService {
  private state: State | null = null;
  private connection: ConnectionState = { status: 'online' };
  private listeners = new Set<(s: RoomSnapshot | null) => void>();
  private connectionListeners = new Set<(c: ConnectionState) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private intervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(private readonly config: MockRoomConfig = DEFAULT_MOCK_CONFIG) {}

  /* ------------------------------------------------------------ lifecycle */

  async createRoom(input: CreateRoomInput, me: PlayerIdentity): Promise<RoomSnapshot> {
    this.reset();
    const host = this.makePlayer(me, true);
    this.state = this.initialState(
      {
        code: String(Math.floor(1000 + Math.random() * 9000)),
        hostId: host.id,
        ...input,
        phase: 'lobby',
        roundIndex: 0,
        paused: false,
      },
      [host],
      me.id,
      BOTS.slice(0, input.maxPlayers - 1),
    );
    this.startBotJoins();
    return this.snapshot()!;
  }

  async joinRoom(code: string, me: PlayerIdentity): Promise<RoomSnapshot> {
    await wait(this.config.latencyMs);
    if (code !== MOCK_JOINABLE_CODE) throw new RoomError('room_not_found');
    this.reset();
    const [hostBot, secondBot, ...rest] = BOTS;
    const host: Player = { ...this.makePlayer({ id: 'bot-André', ...hostBot }, true), joinedAt: Date.now() - 60000 };
    const second: Player = { ...this.makePlayer({ id: 'bot-Carol', ...secondBot }, false), joinedAt: Date.now() - 30000 };
    this.state = this.initialState(
      { code, hostId: host.id, gameId: 'impostor', category: 'Comidas', totalRounds: 5, maxPlayers: 6, phase: 'lobby', roundIndex: 0, paused: false },
      [host, second, this.makePlayer(me, false)],
      me.id,
      rest.slice(0, 3),
    );
    this.startBotJoins();
    return this.snapshot()!;
  }

  async leaveRoom(): Promise<void> {
    this.reset();
    this.emit();
  }

  /* --------------------------------------------------------------- stream */

  subscribe(listener: (s: RoomSnapshot | null) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  subscribeConnection(listener: (c: ConnectionState) => void): Unsubscribe {
    this.connectionListeners.add(listener);
    listener(this.connection);
    return () => this.connectionListeners.delete(listener);
  }

  retryConnection(): void {
    this.runReconnect(true);
  }

  /* ------------------------------------------------------- host commands */

  async startMatch(): Promise<void> {
    const s = this.requireHost();
    if (s.room.phase !== 'lobby') throw new RoomError('invalid_phase');
    if (this.connectedPlayers().length < IMPOSTOR_RULES.minPlayers) throw new RoomError('invalid_phase');
    this.clearInterval('botJoins');
    s.pendingBots = [];
    this.beginRound(1);
  }

  async setTimerRunning(running: boolean): Promise<void> {
    this.requireHost();
    this.applyTimerRunning(running);
  }

  async resetTimer(): Promise<void> {
    const s = this.requireHost();
    this.clearInterval('roundTimer');
    s.timer = { remainingSec: IMPOSTOR_RULES.roundSeconds, running: false };
    this.emit();
  }

  async openVoting(): Promise<void> {
    this.requireHost();
    this.applyOpenVoting();
  }

  async nextRound(): Promise<void> {
    this.requireHost();
    this.applyNextRound();
  }

  async playAgain(): Promise<void> {
    const s = this.requireHost();
    s.scores = Object.fromEntries(s.players.map((p) => [p.id, { playerId: p.id, points: 0, lastDelta: 0 }]));
    s.usedWords.clear();
    s.impostorsCaught = 0;
    s.round = null;
    s.result = null;
    s.votes = {};
    s.room = { ...s.room, phase: 'lobby', roundIndex: 0, paused: false };
    this.emit();
  }

  /* ----------------------------------------------------- player commands */

  async ackRole(): Promise<void> {
    const s = this.requireState();
    if (s.room.phase !== 'role_reveal') return;
    // Bots "confirmam" na hora; no backend real a fase avança quando todos confirmarem.
    s.room = { ...s.room, phase: 'clues' };
    this.emit();
    if (!this.iAmHost()) {
      this.after(1000, () => this.applyTimerRunning(true));
      this.after(this.config.botHostOpenVotingMs, () => this.whenNotPaused(() => this.applyOpenVoting()));
    }
  }

  async castVote(targetId: PlayerId): Promise<void> {
    const s = this.requireState();
    if (s.room.phase !== 'voting' || s.votes[s.meId]) return;
    s.votes = { ...s.votes, [s.meId]: targetId };
    this.emit();
    this.startBotVotes();
  }

  async setPaused(paused: boolean): Promise<void> {
    const s = this.requireState();
    if (paused) this.applyTimerRunning(false);
    s.room = { ...s.room, paused };
    this.emit();
  }

  /* ---------------------------------------------------------------- debug */

  readonly debug: RoomServiceDebug = {
    simulateConnectionDrop: ({ recover }) => this.runReconnect(recover),
    simulateHostLeft: () => this.close('host_left'),
    simulateNotEnoughPlayers: () => {
      const s = this.state;
      if (!s) return;
      const keep = new Set([s.meId, ...s.players.filter((p) => p.id !== s.meId).slice(0, 1).map((p) => p.id)]);
      s.players = s.players.filter((p) => keep.has(p.id));
      this.close('not_enough_players');
    },
    simulatePlayerDisconnect: () => {
      const s = this.state;
      const target = s?.players.find((p) => p.id !== s.meId && !p.isHost && p.connected);
      if (!s || !target) return;
      s.players = s.players.map((p) => (p.id === target.id ? { ...p, connected: false } : p));
      this.emit();
    },
    hostAdvance: () => {
      const phase = this.state?.room.phase;
      if (phase === 'lobby') this.beginRound(1);
      else if (phase === 'clues') this.applyOpenVoting();
      else if (phase === 'revealing') this.applyNextRound();
    },
  };

  /* ------------------------------------------------------------ internals */

  private initialState(room: Room, players: Player[], meId: PlayerId, pendingBots: State['pendingBots']): State {
    return {
      room,
      players,
      meId,
      round: null,
      timer: { remainingSec: IMPOSTOR_RULES.roundSeconds, running: false },
      votes: {},
      result: null,
      scores: Object.fromEntries(players.map((p) => [p.id, { playerId: p.id, points: 0, lastDelta: 0 }])),
      usedWords: new Set(),
      impostorsCaught: 0,
      pendingBots,
    };
  }

  private makePlayer(identity: PlayerIdentity, isHost: boolean): Player {
    return { ...identity, isHost, connected: true, joinedAt: Date.now() };
  }

  private startBotJoins() {
    this.every('botJoins', this.config.botJoinEveryMs, () => {
      const s = this.state;
      const bot = s?.pendingBots.shift();
      if (!s || !bot || s.room.phase !== 'lobby') return this.clearInterval('botJoins');
      const player = this.makePlayer({ id: `bot-${bot.name}`, ...bot }, false);
      s.players = [...s.players, player];
      s.scores[player.id] = { playerId: player.id, points: 0, lastDelta: 0 };
      this.emit();
      if (s.pendingBots.length === 0) {
        this.clearInterval('botJoins');
        if (!this.iAmHost()) this.after(this.config.botHostStartMs, () => this.state?.room.phase === 'lobby' && this.beginRound(1));
      }
    });
  }

  private beginRound(index: number) {
    const s = this.requireState();
    this.clearInterval('roundTimer');
    this.clearInterval('botVotes');
    s.round = createImpostorRound(this.connectedPlayers(), s.room.category, s.usedWords);
    s.usedWords.add(s.round.word.word);
    s.timer = { remainingSec: IMPOSTOR_RULES.roundSeconds, running: false };
    s.votes = {};
    s.result = null;
    s.room = { ...s.room, phase: 'role_reveal', roundIndex: index, paused: false };
    this.emit();
  }

  private applyTimerRunning(running: boolean) {
    const s = this.state;
    if (!s || s.room.phase !== 'clues') return;
    this.clearInterval('roundTimer');
    if (running && s.timer.remainingSec > 0) {
      this.every('roundTimer', 1000, () => {
        const st = this.state;
        if (!st) return;
        const remainingSec = Math.max(0, st.timer.remainingSec - 1);
        st.timer = { remainingSec, running: remainingSec > 0 };
        if (remainingSec === 0) this.clearInterval('roundTimer');
        this.emit();
      });
    }
    s.timer = { ...s.timer, running: running && s.timer.remainingSec > 0 };
    this.emit();
  }

  private applyOpenVoting() {
    const s = this.state;
    if (!s || s.room.phase !== 'clues') return;
    this.clearInterval('roundTimer');
    s.timer = { ...s.timer, running: false };
    s.room = { ...s.room, phase: 'voting', paused: false };
    this.emit();
  }

  private startBotVotes() {
    this.every('botVotes', this.config.botVoteEveryMs, () => {
      const s = this.state;
      if (!s || !s.round || s.room.phase !== 'voting') return this.clearInterval('botVotes');
      const voters = this.connectedPlayers();
      const next = voters.find((p) => !s.votes[p.id]);
      if (next) {
        s.votes = { ...s.votes, [next.id]: botVote(next.id, s.round, voters) };
        this.emit();
      }
      if (voters.every((p) => s.votes[p.id])) {
        this.clearInterval('botVotes');
        this.after(this.config.allVotedPauseMs, () => this.reveal());
      }
    });
  }

  private reveal() {
    const s = this.state;
    if (!s || !s.round || s.room.phase !== 'voting') return;
    const resolved = resolveImpostorRound(s.round, s.votes, this.connectedPlayers());
    s.result = { ...resolved, stage: 0 };
    if (resolved.caught) s.impostorsCaught += 1;
    for (const [id, delta] of Object.entries(resolved.pointsDelta)) {
      const prev = s.scores[id] ?? { playerId: id, points: 0, lastDelta: 0 };
      s.scores[id] = { playerId: id, points: prev.points + delta, lastDelta: delta };
    }
    s.room = { ...s.room, phase: 'revealing' };
    this.emit();

    const setStage = (stage: 1 | 2) => {
      if (!this.state?.result || this.state.room.phase !== 'revealing') return;
      this.state.result = { ...this.state.result, stage };
      this.emit();
    };
    this.after(this.config.revealStage1Ms, () => setStage(1));
    this.after(this.config.revealStage2Ms, () => {
      setStage(2);
      if (!this.iAmHost()) this.after(this.config.botHostNextRoundMs, () => this.whenNotPaused(() => this.applyNextRound()));
    });
  }

  private applyNextRound() {
    const s = this.state;
    if (!s || s.room.phase !== 'revealing') return;
    if (s.room.roundIndex >= s.room.totalRounds) {
      s.room = { ...s.room, phase: 'finished' };
      this.emit();
    } else {
      this.beginRound(s.room.roundIndex + 1);
    }
  }

  private close(reason: NonNullable<Room['closedReason']>) {
    const s = this.state;
    if (!s) return;
    this.clearAllTimers();
    if (reason === 'host_left') s.players = s.players.map((p) => (p.isHost && p.id !== s.meId ? { ...p, connected: false } : p));
    s.room = { ...s.room, phase: 'closed', closedReason: reason, paused: false };
    this.emit();
  }

  private runReconnect(recover: boolean) {
    this.clearInterval('reconnect');
    const { reconnectTimeoutSec: timeoutSec, reconnectMs } = this.config;
    let secondsLeft = timeoutSec;
    const stopAt = timeoutSec - Math.round(reconnectMs / 1000);
    this.setConnection({ status: 'reconnecting', secondsLeft, timeoutSec });
    this.every('reconnect', 1000, () => {
      secondsLeft -= 1;
      if (secondsLeft <= stopAt) {
        this.clearInterval('reconnect');
        this.setConnection(recover ? { status: 'online' } : { status: 'failed' });
      } else {
        this.setConnection({ status: 'reconnecting', secondsLeft, timeoutSec });
      }
    });
  }

  private snapshot(): RoomSnapshot | null {
    const s = this.state;
    if (!s) return null;
    const connected = this.connectedPlayers();
    const ranked = Object.values(s.scores)
      .filter((sc) => s.players.some((p) => p.id === sc.playerId))
      .sort((a, b) => b.points - a.points);
    const inRound = s.round && s.room.phase !== 'lobby';
    return {
      room: { ...s.room },
      players: [...s.players],
      meId: s.meId,
      round: inRound
        ? {
            index: s.room.roundIndex,
            category: s.round!.category,
            starterId: s.round!.order[0],
            order: s.round!.order,
            timer: { durationSec: IMPOSTOR_RULES.roundSeconds, ...s.timer },
          }
        : null,
      secret: inRound
        ? s.round!.impostorId === s.meId
          ? { role: 'impostor' }
          : { role: 'word', word: s.round!.word.word, emoji: s.round!.word.emoji }
        : null,
      votes:
        s.room.phase === 'voting' || s.room.phase === 'revealing'
          ? { votedIds: Object.keys(s.votes), total: connected.length, myVote: s.votes[s.meId] ?? null }
          : null,
      result: s.result ? { ...s.result } : null,
      scores: ranked,
      summary: s.room.phase === 'finished' && ranked[0] ? { winnerId: ranked[0].playerId, impostorsCaught: s.impostorsCaught } : null,
    };
  }

  private connectedPlayers(): Player[] {
    return this.state?.players.filter((p) => p.connected) ?? [];
  }

  private iAmHost(): boolean {
    return !!this.state && this.state.room.hostId === this.state.meId;
  }

  private requireState(): State {
    if (!this.state) throw new RoomError('not_in_room');
    return this.state;
  }

  private requireHost(): State {
    const s = this.requireState();
    if (!this.iAmHost()) throw new RoomError('not_host');
    return s;
  }

  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }

  private setConnection(c: ConnectionState) {
    this.connection = c;
    this.connectionListeners.forEach((l) => l(c));
  }

  /** Bot-host respeita a pausa: tenta de novo a cada segundo. */
  private whenNotPaused(fn: () => void) {
    if (this.state?.room.paused) this.after(1000, () => this.whenNotPaused(fn));
    else fn();
  }

  private after(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private every(key: string, ms: number, fn: () => void) {
    this.clearInterval(key);
    this.intervals.set(key, setInterval(fn, ms));
  }

  private clearInterval(key: string) {
    const i = this.intervals.get(key);
    if (i) clearInterval(i);
    this.intervals.delete(key);
  }

  private clearAllTimers() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    [...this.intervals.keys()].forEach((k) => this.clearInterval(k));
  }

  private reset() {
    this.clearAllTimers();
    this.state = null;
    this.setConnection({ status: 'online' });
  }
}

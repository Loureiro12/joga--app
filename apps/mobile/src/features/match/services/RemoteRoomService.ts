import {
  PROTOCOL_VERSION,
  RoomError,
  type ClientMessage,
  type ConnectionState,
  type CreateRoomInput,
  type PlayerId,
  type PlayerIdentity,
  type RoomCommand,
  type RoomSnapshot,
  type ServerMessage,
} from '@jogae/engine';

import { logWs } from '@/core/logging/logger';

import type { RoomService, Unsubscribe } from './RoomService';

/**
 * Resumo de uma linha para o log. Ping e pong ficam de fora: são dezenas por partida e
 * afogariam justamente as mensagens que interessam.
 */
function describe(message: ClientMessage | ServerMessage): string | null {
  switch (message.t) {
    case 'ping':
    case 'pong':
      return null;
    // O token do `hello` nunca entra: é a sessão inteira de quem está jogando.
    case 'hello':
      return `hello v${message.v}`;
    case 'create':
      return `create ${message.input.gameId} · ${message.input.totalRounds} rodadas`;
    case 'join':
      return `join ${message.code}`;
    case 'resume':
      return `resume ${message.code}`;
    case 'leave':
      return 'leave';
    case 'cmd':
      return `cmd ${message.cmd.type}`;
    case 'welcome':
      return 'welcome';
    case 'ack':
      return message.ok ? `ack #${message.id} ok` : `ack #${message.id} ✗ ${message.error}`;
    case 'snapshot':
      return message.snapshot ? `snapshot ${message.snapshot.room.phase} · ${message.snapshot.players.length} jogadores` : 'snapshot (fora da sala)';
    case 'bye':
      return `bye ${message.reason}`;
  }
}

/** O mínimo de WebSocket que usamos — o global do React Native/navegador, ou o pacote `ws` nos testes em Node. */
type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
};
type SocketCtor = new (url: string) => SocketLike;

export type RemoteRoomOptions = {
  url: string;
  /** Access token do Supabase (ou `dev:<id>` contra um servidor em modo dev). */
  getToken: () => Promise<string | null>;
  WebSocketImpl?: SocketCtor;
  /** Igual à tolerância do servidor: depois disso a vaga já foi liberada, não adianta insistir. */
  reconnectTimeoutSec?: number;
  requestTimeoutMs?: number;
  /**
   * Prazo para ABRIR a conexão. Bem maior que o de uma requisição: com o servidor hospedado
   * desligando quando ocioso, a primeira conexão espera a máquina acordar (medido: ~12 s no Fly).
   */
  connectTimeoutMs?: number;
  pingEveryMs?: number;
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Request = DistributiveOmit<Extract<ClientMessage, { id: number }>, 'id'>;
type Pending = { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

const OPEN = 1;

/**
 * `RoomService` sobre WebSocket, falando com `apps/room-server`.
 * O estado é sempre o último `snapshot` recebido; comandos só recebem um ok/erro.
 * Se a conexão cai no meio de uma sala, reconecta sozinho e pede `resume` — é isso que alimenta
 * o overlay "Reconectando…" do app.
 */
export class RemoteRoomService implements RoomService {
  private socket: SocketLike | null = null;
  private opening: Promise<void> | null = null;
  private roomCode: string | null = null;
  private snapshot: RoomSnapshot | null = null;
  private connection: ConnectionState = { status: 'online' };
  private readonly listeners = new Set<(s: RoomSnapshot | null) => void>();
  private readonly connectionListeners = new Set<(c: ConnectionState) => void>();
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private lastMessageAt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectDeadline = 0;
  private attempt = 0;
  private snapshotWaiters: (() => void)[] = [];

  private readonly timeoutSec: number;
  private readonly requestTimeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly pingEveryMs: number;

  constructor(private readonly options: RemoteRoomOptions) {
    this.timeoutSec = options.reconnectTimeoutSec ?? 30;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 8000;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 25_000;
    this.pingEveryMs = options.pingEveryMs ?? 10_000;
  }

  /* ------------------------------------------------------------ ciclo de vida */

  async createRoom(input: CreateRoomInput, me: PlayerIdentity): Promise<RoomSnapshot> {
    return this.enter({ t: 'create', input, me: { name: me.name, color: me.color } });
  }

  async joinRoom(code: string, me: PlayerIdentity): Promise<RoomSnapshot> {
    return this.enter({ t: 'join', code, me: { name: me.name, color: me.color } });
  }

  async leaveRoom(): Promise<void> {
    const wasOpen = this.socket?.readyState === OPEN;
    this.roomCode = null;
    this.stopReconnecting();
    if (wasOpen) await this.request({ t: 'leave' }).catch(() => {});
    this.closeSocket();
    this.setSnapshot(null);
    this.setConnection({ status: 'online' });
  }

  /* ------------------------------------------------------------------- stream */

  subscribe(listener: (s: RoomSnapshot | null) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  subscribeConnection(listener: (c: ConnectionState) => void): Unsubscribe {
    this.connectionListeners.add(listener);
    listener(this.connection);
    return () => this.connectionListeners.delete(listener);
  }

  retryConnection(): void {
    if (this.roomCode) this.startReconnecting();
  }

  /** O app voltou ao primeiro plano: o sistema pode ter matado o socket sem avisar. */
  notifyForeground(): void {
    if (this.roomCode && this.socket?.readyState !== OPEN && this.connection.status !== 'reconnecting') this.startReconnecting();
  }

  /* ----------------------------------------------------------------- comandos */

  startMatch = () => this.command({ type: 'startMatch' });
  setTimerRunning = (running: boolean) => this.command({ type: 'setTimerRunning', running });
  resetTimer = () => this.command({ type: 'resetTimer' });
  openVoting = () => this.command({ type: 'openVoting' });
  nextRound = () => this.command({ type: 'nextRound' });
  playAgain = () => this.command({ type: 'playAgain' });
  endVoting = () => this.command({ type: 'endVoting' });
  skipQuestion = () => this.command({ type: 'skipQuestion' });
  endMatch = () => this.command({ type: 'endMatch' });
  missionReady = () => this.command({ type: 'missionReady' });
  missionDone = () => this.command({ type: 'missionDone' });
  accuse = (targetId: PlayerId, missionId: string) => this.command({ type: 'accuse', targetId, missionId });
  swapMission = () => this.command({ type: 'swapMission' });
  nextReveal = () => this.command({ type: 'nextReveal' });
  voteReveal = (valid: boolean) => this.command({ type: 'voteReveal', valid });
  pairWith = (targetId: PlayerId) => this.command({ type: 'pairWith', targetId });
  unpair = () => this.command({ type: 'unpair' });
  beginQuestions = () => this.command({ type: 'beginQuestions' });
  submitAnswer = (value: string) => this.command({ type: 'submitAnswer', value });
  ackRole = () => this.command({ type: 'ackRole' });
  castVote = (targetId: PlayerId) => this.command({ type: 'castVote', targetId });
  setPaused = (paused: boolean) => this.command({ type: 'setPaused', paused });

  private command(cmd: RoomCommand): Promise<void> {
    if (!this.roomCode) return Promise.reject(new RoomError('not_in_room'));
    return this.request({ t: 'cmd', cmd });
  }

  /* ------------------------------------------------------------------ conexão */

  private async enter(message: Extract<Request, { t: 'create' | 'join' }>): Promise<RoomSnapshot> {
    this.roomCode = null;
    this.stopReconnecting();
    this.setSnapshot(null);
    await this.connect();
    await this.request(message);
    // O snapshot pode chegar antes ou depois do ack; o que vale é tê-lo.
    if (!this.snapshot) await this.waitForSnapshot();
    const snapshot = this.snapshot as RoomSnapshot | null;
    if (!snapshot) throw new RoomError('timeout');
    this.roomCode = snapshot.room.code;
    return snapshot;
  }

  private connect(): Promise<void> {
    if (this.socket?.readyState === OPEN) return Promise.resolve();
    if (this.opening) return this.opening;

    this.opening = (async () => {
      const token = await this.options.getToken();
      if (!token) throw new RoomError('unauthenticated');
      const Impl = this.options.WebSocketImpl ?? (globalThis as unknown as { WebSocket: SocketCtor }).WebSocket;
      const socket = new Impl(this.options.url);
      this.socket = socket;

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => fail(new RoomError('timeout')), this.connectTimeoutMs);
        const fail = (e: Error) => {
          clearTimeout(timer);
          socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
          try {
            socket.close();
          } catch {
            /* já fechado */
          }
          if (this.socket === socket) this.socket = null;
          reject(e);
        };
        socket.onopen = () => {
          const hello = { t: 'hello', v: PROTOCOL_VERSION, token } satisfies ClientMessage;
          logWs('envia', describe(hello)!);
          socket.send(JSON.stringify(hello));
        };
        socket.onerror = () => fail(new RoomError('timeout'));
        socket.onclose = () => fail(new RoomError('timeout'));
        socket.onmessage = (event) => {
          const message = this.parse(event.data);
          if (message) logWs('recebe', describe(message) ?? '');
          if (message?.t === 'bye') return fail(new RoomError(message.reason === 'unauthenticated' ? 'unauthenticated' : 'timeout'));
          if (message?.t !== 'welcome') return;
          clearTimeout(timer);
          socket.onmessage = (e) => this.onMessage(socket, e.data);
          socket.onclose = () => this.onSocketClosed(socket);
          socket.onerror = () => {};
          this.lastMessageAt = Date.now();
          this.startPinging();
          resolve();
        };
      });
    })().finally(() => (this.opening = null));
    return this.opening;
  }

  private onMessage(socket: SocketLike, data: unknown) {
    if (socket !== this.socket) return;
    const message = this.parse(data);
    if (!message) return;
    this.lastMessageAt = Date.now();
    const resumo = describe(message);
    if (resumo) logWs('recebe', resumo);

    if (message.t === 'snapshot') {
      // `null` = não faço mais parte da sala (saí, ou minha tolerância venceu).
      if (message.snapshot === null && this.roomCode) this.roomCode = null;
      this.setSnapshot(message.snapshot);
    } else if (message.t === 'ack') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.ok) pending.resolve();
      else pending.reject(new RoomError(message.error));
    } else if (message.t === 'bye' && message.reason === 'replaced') {
      // Esta conta abriu o jogo em outro aparelho: este aqui para de insistir.
      this.roomCode = null;
      this.setConnection({ status: 'failed' });
    }
  }

  private onSocketClosed(socket: SocketLike) {
    if (socket !== this.socket) return;
    this.socket = null;
    this.stopPinging();
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new RoomError('timeout'));
      this.pending.delete(id);
    }
    if (this.roomCode && this.connection.status !== 'failed') this.startReconnecting();
  }

  /* --------------------------------------------------------------- reconexão */

  private startReconnecting() {
    this.stopReconnecting();
    this.attempt = 0;
    this.reconnectDeadline = Date.now() + this.timeoutSec * 1000;
    const tick = () => {
      const secondsLeft = Math.max(0, Math.ceil((this.reconnectDeadline - Date.now()) / 1000));
      if (secondsLeft === 0) return this.giveUp();
      this.setConnection({ status: 'reconnecting', secondsLeft, timeoutSec: this.timeoutSec });
    };
    tick();
    this.countdownTimer = setInterval(tick, 1000);
    this.tryReconnect();
  }

  private async tryReconnect() {
    const code = this.roomCode;
    if (!code) return;
    try {
      await this.connect();
      await this.request({ t: 'resume', code });
      this.stopReconnecting();
      this.setConnection({ status: 'online' });
    } catch (e) {
      if (!this.roomCode) return; // saiu da sala enquanto tentava
      if (e instanceof RoomError && (e.code === 'not_in_room' || e.code === 'unauthenticated')) return this.giveUp();
      this.attempt += 1;
      const delay = Math.min(4000, 400 * 2 ** Math.min(this.attempt, 4));
      if (Date.now() + delay >= this.reconnectDeadline) return; // o contador encerra
      this.reconnectTimer = setTimeout(() => this.tryReconnect(), delay);
    }
  }

  private giveUp() {
    this.stopReconnecting();
    this.closeSocket();
    this.setConnection({ status: 'failed' });
  }

  private stopReconnecting() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.reconnectTimer = this.countdownTimer = null;
  }

  /* ------------------------------------------------------------------ interno */

  private request(message: Request): Promise<void> {
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN) return Promise.reject(new RoomError('timeout'));
    const id = this.nextId++;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RoomError('timeout'));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const resumo = describe({ ...message, id } as ClientMessage);
      if (resumo) logWs('envia', `${resumo} #${id}`);
      socket.send(JSON.stringify({ ...message, id }));
    });
  }

  private waitForSnapshot(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      this.snapshotWaiters.push(() => (clearTimeout(timer), resolve()));
    });
  }

  private startPinging() {
    this.stopPinging();
    this.pingTimer = setInterval(() => {
      const socket = this.socket;
      if (!socket || socket.readyState !== OPEN) return;
      // Dois pings sem nenhuma resposta: o socket morreu sem avisar (rede trocou, servidor sumiu).
      if (Date.now() - this.lastMessageAt > this.pingEveryMs * 2.5) return socket.close();
      socket.send(JSON.stringify({ t: 'ping' } satisfies ClientMessage));
    }, this.pingEveryMs);
  }

  private stopPinging() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private closeSocket() {
    const socket = this.socket;
    this.socket = null;
    this.stopPinging();
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    try {
      socket.close();
    } catch {
      /* já fechado */
    }
  }

  private parse(data: unknown): ServerMessage | null {
    try {
      return JSON.parse(typeof data === 'string' ? data : String(data)) as ServerMessage;
    } catch {
      return null;
    }
  }

  private setSnapshot(snapshot: RoomSnapshot | null) {
    this.snapshot = snapshot;
    this.listeners.forEach((l) => l(snapshot));
    if (snapshot) this.snapshotWaiters.splice(0).forEach((w) => w());
  }

  private setConnection(connection: ConnectionState) {
    this.connection = connection;
    this.connectionListeners.forEach((l) => l(connection));
  }
}

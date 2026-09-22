import { RoomEngine, RoomError, type RoomPublicInfo, type CreateRoomInput, type EngineConfig, type PlayerAppearance, type PlayerId, type RoomCommand, type RoomSnapshot, type Scheduler } from '@jogae/engine';

import { NullMatchRecorder, type MatchRecorder } from './MatchRecorder';
import { NullRoomPresence, type PresenceRoom, type RoomPresence } from './RoomPresence';
import type { RoomStore } from './RoomStore';

/** Um celular conectado. O gerenciador só precisa saber mandar o snapshot e fechar. */
export type Connection = {
  id: number;
  sendSnapshot(snapshot: RoomSnapshot | null): void;
  close(reason: 'replaced' | 'shutdown'): void;
};

export type RoomManagerOptions = {
  store: RoomStore;
  /** Recebe o boletim quando uma partida chega ao fim. */
  recorder?: MatchRecorder;
  /** Recebe o estado das salas vivas — o "jogando agora" da tela Amigos. */
  presence?: RoomPresence;
  scheduler?: Scheduler;
  engineConfig?: Partial<EngineConfig>;
  rng?: () => number;
  /** Tentativas de entrada com código errado, por usuário e por IP, por minuto. */
  maxFailedJoinsPerMinute?: number;
  /** Sala sem ninguém conectado é descartada depois desse tempo parada. */
  idleRoomMs?: number;
  log?: (event: string, data?: Record<string, unknown>) => void;
};

/** Sala encerrada (placar final) ou fechada não conta como "jogando agora". */
function presenceOf(engine: RoomEngine): PresenceRoom | null {
  const info = engine.publicInfo();
  if (!info || info.status === 'finished') return null;
  return { code: info.code, gameId: info.gameId, status: info.status, playerIds: engine.playerIds };
}

const CODE_SPACE = 9000;
/** Acima disso o sorteio de código livre começa a demorar e o código fica fácil de adivinhar. */
const MAX_ROOMS = 6000;

/**
 * Todas as salas do processo. Garante: código único entre salas ativas, um usuário em no máximo
 * uma sala, snapshot individual para cada conexão, e persistência a cada mudança.
 */
export class RoomManager {
  private readonly rooms = new Map<string, RoomEngine>();
  private readonly roomOfUser = new Map<PlayerId, string>();
  private readonly connections = new Map<PlayerId, Connection>();
  private readonly failedJoins = new Map<string, number[]>();
  /** Partidas já enviadas ao histórico neste processo (a gravação em si também é idempotente). */
  private readonly recorded = new Set<string>();
  private readonly recorder: MatchRecorder;
  private readonly presence: RoomPresence;
  private readonly now: () => number;
  private readonly opts: Required<Pick<RoomManagerOptions, 'maxFailedJoinsPerMinute' | 'idleRoomMs'>> & RoomManagerOptions;

  constructor(options: RoomManagerOptions) {
    this.opts = { maxFailedJoinsPerMinute: 10, idleRoomMs: 10 * 60_000, ...options };
    this.recorder = options.recorder ?? new NullMatchRecorder();
    this.presence = options.presence ?? new NullRoomPresence();
    this.now = options.scheduler ? () => options.scheduler!.now() : () => Date.now();
  }

  get roomCount() {
    return this.rooms.size;
  }
  get connectionCount() {
    return this.connections.size;
  }

  /** Recarrega as salas salvas. Ninguém está conectado ainda: todos entram na tolerância de reconexão. */
  restore(): number {
    for (const state of this.opts.store.loadAll()) {
      const code = state.room.code;
      const engine = RoomEngine.restore(state, this.engineDeps(code));
      this.rooms.set(code, engine);
      for (const id of engine.playerIds) {
        this.roomOfUser.set(id, code);
        engine.setConnected(id, false);
      }
    }
    this.presence.reset([...this.rooms.values()].map(presenceOf).filter((room) => room !== null));
    return this.rooms.size;
  }

  /* ------------------------------------------------------------------ conexões */

  attach(userId: PlayerId, connection: Connection) {
    const previous = this.connections.get(userId);
    this.connections.set(userId, connection);
    // Mesmo usuário em outro aparelho (ou reconectando antes de a conexão velha cair): a nova vence.
    if (previous && previous.id !== connection.id) previous.close('replaced');
  }

  detach(userId: PlayerId, connectionId: number) {
    if (this.connections.get(userId)?.id !== connectionId) return; // já foi substituída
    this.connections.delete(userId);
    this.roomFor(userId)?.setConnected(userId, false);
  }

  /* ------------------------------------------------------------------ requisições */

  create(userId: PlayerId, input: CreateRoomInput, me: PlayerAppearance): void {
    this.leave(userId);
    if (this.rooms.size >= MAX_ROOMS) throw new RoomError('rate_limited');
    const code = this.freeCode();
    const engine = RoomEngine.create(code, input, { id: userId, ...me }, this.engineDeps(code));
    this.rooms.set(code, engine);
    this.roomOfUser.set(userId, code);
    this.opts.log?.('room_created', { code, rooms: this.rooms.size });
    this.afterChange(code);
  }

  join(userId: PlayerId, code: string, me: PlayerAppearance, ip: string): void {
    this.assertNotBruteForcing(userId, ip);
    const engine = this.rooms.get(code);
    if (!engine || engine.phase === 'closed') {
      this.recordFailedJoin(userId, ip);
      throw new RoomError('room_not_found');
    }
    if (this.roomOfUser.get(userId) !== code) this.leave(userId);
    engine.join({ id: userId, ...me }); // pode lançar room_full / match_in_progress
    this.roomOfUser.set(userId, code);
    this.pushTo(userId);
  }

  resume(userId: PlayerId, code: string): void {
    const engine = this.rooms.get(code);
    if (!engine?.has(userId)) throw new RoomError('not_in_room');
    this.roomOfUser.set(userId, code);
    engine.setConnected(userId, true);
    this.pushTo(userId); // mesmo que nada tenha mudado, quem voltou precisa do estado atual
  }

  leave(userId: PlayerId): void {
    const engine = this.roomFor(userId);
    if (!engine) return; // não estava em sala nenhuma: nada a avisar
    this.roomOfUser.delete(userId);
    engine.leave(userId);
    this.connections.get(userId)?.sendSnapshot(null);
  }

  dispatch(userId: PlayerId, command: RoomCommand): void {
    const engine = this.roomFor(userId);
    if (!engine) throw new RoomError('not_in_room');
    engine.dispatch(userId, command);
  }

  /** Para a página de convite do site. Só leitura e sem nada secreto. */
  publicInfo(code: string): RoomPublicInfo | null {
    return this.rooms.get(code)?.publicInfo() ?? null;
  }

  /* ------------------------------------------------------------------ manutenção */

  /** Descarta salas abandonadas. Chamado periodicamente pelo servidor. */
  sweep(): number {
    const now = this.now();
    let removed = 0;
    for (const [code, engine] of this.rooms) {
      const anyoneOnline = engine.playerIds.some((id) => this.connections.has(id));
      if (!anyoneOnline && now - engine.lastActivityAt > this.opts.idleRoomMs) {
        this.destroy(code);
        removed++;
      }
    }
    for (const [key, hits] of this.failedJoins) if (hits.every((t) => now - t > 60_000)) this.failedJoins.delete(key);
    return removed;
  }

  shutdown() {
    for (const connection of this.connections.values()) connection.close('shutdown');
    this.connections.clear();
    for (const [code, engine] of this.rooms) {
      this.opts.store.save(code, engine.serialize());
      engine.dispose();
    }
    this.presence.dispose();
  }

  /* ------------------------------------------------------------------ interno */

  private engineDeps(code: string) {
    return { scheduler: this.opts.scheduler, rng: this.opts.rng, config: this.opts.engineConfig, onChange: () => this.afterChange(code) };
  }

  private roomFor(userId: PlayerId): RoomEngine | undefined {
    const code = this.roomOfUser.get(userId);
    return code ? this.rooms.get(code) : undefined;
  }

  /** Depois de qualquer mudança: persiste, avisa cada jogador com a visão DELE, e solta quem saiu. */
  private afterChange(code: string) {
    const engine = this.rooms.get(code);
    if (!engine) return;
    if (engine.isEmpty) return this.destroy(code);

    this.opts.store.save(code, engine.serialize());
    this.recordIfFinished(engine);
    const presence = presenceOf(engine);
    if (presence) this.presence.publish(presence);
    else this.presence.remove(code);
    const present = new Set(engine.playerIds);
    for (const id of present) this.connections.get(id)?.sendSnapshot(engine.snapshotFor(id));

    // Removidos pelo engine (tolerância vencida): não pertencem mais à sala.
    for (const [userId, roomCode] of this.roomOfUser) {
      if (roomCode !== code || present.has(userId)) continue;
      this.roomOfUser.delete(userId);
      this.connections.get(userId)?.sendSnapshot(null);
    }
  }

  /** Partida terminou → boletim para o histórico. Fora do caminho dos jogadores: nunca atrasa nem derruba a sala. */
  private recordIfFinished(engine: RoomEngine) {
    const record = engine.matchRecord();
    if (!record || this.recorded.has(record.matchId)) return;
    this.recorded.add(record.matchId);
    if (this.recorded.size > 5000) this.recorded.delete(this.recorded.values().next().value!);
    this.recorder.record(record).catch((e) => this.opts.log?.('match_record_failed', { matchId: record.matchId, error: String(e) }));
  }

  private pushTo(userId: PlayerId) {
    const engine = this.roomFor(userId);
    if (engine?.has(userId)) this.connections.get(userId)?.sendSnapshot(engine.snapshotFor(userId));
  }

  private destroy(code: string) {
    const engine = this.rooms.get(code);
    if (!engine) return;
    engine.dispose();
    this.rooms.delete(code);
    this.opts.store.remove(code);
    this.presence.remove(code);
    for (const [userId, roomCode] of this.roomOfUser) if (roomCode === code) this.roomOfUser.delete(userId);
    this.opts.log?.('room_destroyed', { code, rooms: this.rooms.size });
  }

  private freeCode(): string {
    const rng = this.opts.rng ?? Math.random;
    for (let attempt = 0; attempt < 200; attempt++) {
      const code = String(1000 + Math.floor(rng() * CODE_SPACE));
      if (!this.rooms.has(code)) return code;
    }
    for (let n = 1000; n < 1000 + CODE_SPACE; n++) if (!this.rooms.has(String(n))) return String(n);
    throw new RoomError('rate_limited');
  }

  private assertNotBruteForcing(userId: PlayerId, ip: string) {
    const now = this.now();
    for (const key of [`u:${userId}`, `ip:${ip}`]) {
      const recent = (this.failedJoins.get(key) ?? []).filter((t) => now - t <= 60_000);
      this.failedJoins.set(key, recent);
      if (recent.length >= this.opts.maxFailedJoinsPerMinute) throw new RoomError('rate_limited');
    }
  }

  private recordFailedJoin(userId: PlayerId, ip: string) {
    const now = this.now();
    for (const key of [`u:${userId}`, `ip:${ip}`]) this.failedJoins.set(key, [...(this.failedJoins.get(key) ?? []), now]);
  }
}

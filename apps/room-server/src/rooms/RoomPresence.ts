import type { Config } from '../config';

/** O que os amigos de um jogador podem saber sobre a sala dele: o jogo, se dá para entrar, e o código. */
export type PresenceRoom = { code: string; gameId: string; status: 'open' | 'playing'; playerIds: string[] };

/**
 * "Jogando agora": espelha as salas vivas na tabela `active_rooms`, que a tela Amigos lê
 * (por `get_my_friends`, só para amigos). É um espelho descartável — a verdade é o RoomManager.
 */
export interface RoomPresence {
  /** Estado atual da sala. Chamado a cada mudança; a implementação descarta o que não mudou. */
  publish(room: PresenceRoom): void;
  remove(code: string): void;
  /** Na subida do servidor: apaga o que sobrou de antes e publica só as salas restauradas. */
  reset(rooms: PresenceRoom[]): void;
  dispose(): void;
}

export class NullRoomPresence implements RoomPresence {
  publish() {}
  remove() {}
  reset() {}
  dispose() {}
}

type Log = (event: string, data?: Record<string, unknown>) => void;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const signature = (room: PresenceRoom) => `${room.gameId}|${room.status}|${room.playerIds.join(',')}`;

/**
 * Escreve em `active_rooms` com a service role, pela API REST do Supabase.
 * - Uma escrita por vez, em fila: um `remove` nunca chega antes do `publish` que veio antes dele.
 * - Sem retry: a renovação periódica reenvia tudo, e quem lê ignora linha com mais de 3 minutos.
 *   Por isso uma falha aqui nunca atrasa nem derruba a sala — no pior caso o amigo some da lista por um minuto.
 */
export class SupabaseRoomPresence implements RoomPresence {
  private readonly rooms = new Map<string, PresenceRoom>();
  private queue: Promise<void> = Promise.resolve();
  private readonly timer: ReturnType<typeof setInterval> | null;

  constructor(
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly log: Log,
    private readonly fetchImpl: typeof fetch = fetch,
    refreshMs = 60_000,
  ) {
    this.timer = refreshMs > 0 ? setInterval(() => this.refresh(), refreshMs) : null;
    // Não segura o processo vivo só por causa da renovação.
    (this.timer as { unref?: () => void } | null)?.unref?.();
  }

  publish(input: PresenceRoom) {
    // Bots e jogadores do modo dev não têm id de usuário do Supabase: não são amigos de ninguém.
    const room = { ...input, playerIds: input.playerIds.filter((id) => UUID.test(id)).sort() };
    const known = this.rooms.get(room.code);
    if (known && signature(known) === signature(room)) return;
    this.rooms.set(room.code, room);
    this.upsert([room]);
  }

  remove(code: string) {
    if (!this.rooms.delete(code)) return;
    this.enqueue('presence_remove_failed', () => this.request('DELETE', `?code=eq.${code}`));
  }

  reset(rooms: PresenceRoom[]) {
    this.rooms.clear();
    this.enqueue('presence_reset_failed', () => this.request('DELETE', '?code=not.is.null'));
    for (const room of rooms) this.publish(room);
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Espera a fila esvaziar (testes e desligamento). */
  idle(): Promise<void> {
    return this.queue;
  }

  private refresh() {
    if (this.rooms.size) this.upsert([...this.rooms.values()]);
  }

  private upsert(rooms: PresenceRoom[]) {
    const rows = rooms.map((r) => ({ code: r.code, game_id: r.gameId, status: r.status, player_ids: r.playerIds, updated_at: new Date().toISOString() }));
    this.enqueue('presence_publish_failed', () => this.request('POST', '?on_conflict=code', rows, { prefer: 'resolution=merge-duplicates,return=minimal' }));
  }

  private enqueue(failure: string, job: () => Promise<void>) {
    this.queue = this.queue.then(job).catch((e) => this.log(failure, { error: String(e) }));
  }

  private async request(method: string, query: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.fetchImpl(`${this.supabaseUrl}/rest/v1/active_rooms${query}`, {
      method,
      headers: { 'content-type': 'application/json', apikey: this.serviceRoleKey, authorization: `Bearer ${this.serviceRoleKey}`, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

export function createRoomPresence(config: Config, log: Log): RoomPresence {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) return new SupabaseRoomPresence(config.supabaseUrl, config.supabaseServiceRoleKey, log);
  log('room_presence_disabled', { reason: 'SUPABASE_SERVICE_ROLE_KEY não definida: amigos não veem quem está jogando' });
  return new NullRoomPresence();
}

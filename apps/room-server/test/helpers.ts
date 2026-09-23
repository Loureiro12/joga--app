import type { AddressInfo } from 'node:net';

import { PROTOCOL_VERSION, type ClientMessage, type CreateRoomInput, type RoomErrorCode, type RoomSnapshot, type ServerMessage } from '@jogae/engine';
import WebSocket from 'ws';

import { loadConfig, type Config } from '../src/config';
import { createRoomServer, type RoomServer, type RoomServerOptions } from '../src/server';

export const FAST = { revealStage1Ms: 30, revealStage2Ms: 60, allVotedPauseMs: 10, graceMs: 250, ackTimeoutMs: 5000 };
export const ME = { name: 'Teste', color: '#7C3AED' };
export const INPUT = { gameId: 'impostor' as const, category: 'Comidas', totalRounds: 2, maxPlayers: 6 };

export async function startServer(env: Record<string, string> = {}, options: RoomServerOptions = {}): Promise<RoomServer & { url: string; base: string; config: Config }> {
  const config = loadConfig({ PORT: '0', NODE_ENV: 'test', AUTH_MODE: 'dev', ...env });
  const server = createRoomServer(config, { engineConfig: FAST, heartbeatMs: 100, helloTimeoutMs: 300, ...options });
  await new Promise<void>((resolve) => server.http.listen(0, resolve));
  const port = (server.http.address() as AddressInfo).port;
  return { ...server, config, url: `ws://127.0.0.1:${port}/ws`, base: `http://127.0.0.1:${port}` };
}

type Ack = { ok: true } | { ok: false; error: RoomErrorCode };

/** Cliente de teste: fala o protocolo cru e guarda tudo que recebeu, para checar o que passou pelo fio. */
/** A view do jogo em curso, já estreitada. Os testes daqui jogam Impostor. */
export type ImpostorView = Extract<RoomSnapshot['game'], { kind: 'impostor' }>;
export const impostorView = (snapshot: RoomSnapshot | null) => snapshot?.game as ImpostorView | undefined;

export class TestClient {
  readonly frames: string[] = [];
  readonly messages: ServerMessage[] = [];
  snapshot: RoomSnapshot | null = null;

  /** Atalho: a parte do snapshot que é do Impostor. */
  get game(): ImpostorView {
    return this.snapshot!.game as ImpostorView;
  }
  closed: { code: number; reason: string } | null = null;
  private nextId = 1;
  private readonly acks = new Map<number, (ack: Ack) => void>();
  private waiters: { test: () => boolean; resolve: () => void }[] = [];

  private constructor(readonly ws: WebSocket, readonly name: string) {
    ws.on('message', (data) => {
      const raw = data.toString();
      const message = JSON.parse(raw) as ServerMessage;
      this.frames.push(raw);
      this.messages.push(message);
      if (message.t === 'snapshot') this.snapshot = message.snapshot;
      if (message.t === 'ack') this.acks.get(message.id)?.(message.ok ? { ok: true } : { ok: false, error: message.error });
      this.flush();
    });
    ws.on('close', (code, reason) => {
      this.closed = { code, reason: reason.toString() };
      this.flush();
    });
  }

  static async open(url: string, name: string, opts: { hello?: boolean; token?: string } = {}): Promise<TestClient> {
    const ws = new WebSocket(url);
    const client = new TestClient(ws, name);
    await new Promise<void>((resolve, reject) => (ws.once('open', resolve), ws.once('error', reject)));
    if (opts.hello !== false) {
      // A constante, nunca o número na mão: com ele escrito aqui, subir a versão trava a suíte inteira.
      client.raw({ t: 'hello', v: PROTOCOL_VERSION, token: opts.token ?? `dev:${name}` });
      await client.until(() => client.messages.some((m) => m.t === 'welcome') || client.closed !== null, 'welcome');
    }
    return client;
  }

  get id() {
    return `dev-${this.name}`;
  }

  raw(message: ClientMessage | Record<string, unknown> | string) {
    this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  request(message: Record<string, unknown>): Promise<Ack> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.acks.set(id, resolve);
      this.raw({ ...message, id });
    });
  }

  /** Atalho: manda e exige sucesso. */
  async ok(message: Record<string, unknown>) {
    const ack = await this.request(message);
    if (!ack.ok) throw new Error(`${this.name}: ${JSON.stringify(message)} → ${ack.error}`);
  }

  cmd(cmd: Record<string, unknown>) {
    return this.ok({ t: 'cmd', cmd });
  }

  until(test: () => boolean, label: string, ms = 3000): Promise<void> {
    if (test()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name}: timeout esperando ${label}; último snapshot: ${JSON.stringify(this.snapshot?.room)}`)), ms);
      this.waiters.push({ test, resolve: () => (clearTimeout(timer), resolve()) });
    });
  }

  untilSnapshot(test: (s: RoomSnapshot) => boolean, label: string, ms?: number) {
    return this.until(() => this.snapshot !== null && test(this.snapshot), label, ms);
  }

  /** Simula celular sem sinal: mata o socket sem avisar o servidor. */
  drop() {
    this.ws.terminate();
  }

  close() {
    this.ws.close();
  }

  private flush() {
    this.waiters = this.waiters.filter((w) => (w.test() ? (w.resolve(), false) : true));
  }
}

/** Sobe uma sala com `names[0]` de host e os demais dentro. Devolve os clientes e o código. */
export async function roomWith(url: string, names: string[], input: CreateRoomInput = INPUT) {
  const clients: TestClient[] = [];
  for (const name of names) clients.push(await TestClient.open(url, name));
  const [host, ...guests] = clients;
  await host.ok({ t: 'create', input, me: { ...ME, name: names[0] } });
  await host.untilSnapshot(() => true, 'sala criada');
  const code = host.snapshot!.room.code;
  for (const guest of guests) await guest.ok({ t: 'join', code, me: { ...ME, name: guest.name } });
  await host.untilSnapshot((s) => s.players.length === names.length, 'todos na sala');
  return { clients, host, guests, code };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

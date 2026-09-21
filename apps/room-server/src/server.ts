import { createServer, type IncomingMessage, type Server } from 'node:http';

import { IMPOSTOR_RULES, PROTOCOL_VERSION, RoomError, type ClientMessage, type EngineConfig, type Scheduler, type ServerMessage } from '@jogae/engine';
import { WebSocketServer, type WebSocket } from 'ws';

import { createTokenVerifier, type TokenVerifier } from './auth';
import type { Config } from './config';
import { parseClientMessage } from './messages';
import { createMatchRecorder, type MatchRecorder } from './rooms/MatchRecorder';
import { RoomManager } from './rooms/RoomManager';
import { FileRoomStore, MemoryRoomStore } from './rooms/RoomStore';

export type RoomServerOptions = {
  verifyToken?: TokenVerifier;
  recorder?: MatchRecorder;
  engineConfig?: Partial<EngineConfig>;
  scheduler?: Scheduler;
  /** Quanto o cliente tem para mandar o `hello` depois de conectar. */
  helloTimeoutMs?: number;
  heartbeatMs?: number;
  log?: (event: string, data?: Record<string, unknown>) => void;
};

export type RoomServer = { http: Server; manager: RoomManager; close(): Promise<void> };

const MAX_MESSAGE_BYTES = 8 * 1024;
/** Um cliente legítimo manda poucas mensagens por minuto; isso barra loop acidental e abuso. */
const MAX_MESSAGES_PER_10S = 60;

export function createRoomServer(config: Config, options: RoomServerOptions = {}): RoomServer {
  const startedAt = Date.now();
  const log = options.log ?? (config.env === 'test' ? () => {} : (event, data) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data })));
  const verifyToken = options.verifyToken ?? createTokenVerifier(config);
  const manager = new RoomManager({
    store: config.storeDir ? new FileRoomStore(config.storeDir) : new MemoryRoomStore(),
    recorder: options.recorder ?? createMatchRecorder(config, log),
    engineConfig: options.engineConfig,
    scheduler: options.scheduler,
    log,
  });
  const restored = manager.restore();
  if (restored) log('rooms_restored', { rooms: restored });

  const http = createServer((req, res) => {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/healthz') {
      return json(200, {
        status: 'ok',
        env: config.env,
        protocol: PROTOCOL_VERSION,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        rooms: manager.roomCount,
        connections: manager.connectionCount,
        games: { impostor: { minPlayers: IMPOSTOR_RULES.minPlayers, roundSeconds: IMPOSTOR_RULES.roundSeconds } },
      });
    }
    // Página de convite do site (jogae.app/j/4827). Público de propósito: quem tem o código já pode entrar na sala.
    const room = req.method === 'GET' ? /^\/api\/room\/(\d{4})$/.exec(req.url?.split('?')[0] ?? '') : null;
    if (room) {
      // 9.000 códigos são fáceis de varrer: o limite impede listar as salas ativas em massa.
      if (!publicApiLimiter(clientIp(req))) return json(429, { error: 'rate_limited' });
      const info = manager.publicInfo(room[1]);
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('cache-control', 'public, max-age=5');
      return info ? json(200, info) : json(404, { error: 'not_found' });
    }
    json(404, { error: 'not_found' });
  });

  const clientIp = (req: IncomingMessage) =>
    String(req.headers['fly-client-ip'] ?? req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0].trim();

  const apiHits = new Map<string, number[]>();
  /** Até 60 consultas por minuto por IP (o site consulta do servidor dele, então o limite é folgado). */
  const publicApiLimiter = (ip: string) => {
    const now = Date.now();
    const recent = (apiHits.get(ip) ?? []).filter((t) => now - t < 60_000);
    recent.push(now);
    apiHits.set(ip, recent);
    if (apiHits.size > 5000) apiHits.clear();
    return recent.length <= 60;
  };

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  http.on('upgrade', (req, socket, head) => {
    if (req.url?.split('?')[0] !== '/ws') return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => handleSocket(ws, req));
  });

  let nextConnectionId = 1;
  const alive = new WeakMap<WebSocket, boolean>();

  function handleSocket(ws: WebSocket, req: IncomingMessage) {
    const connectionId = nextConnectionId++;
    const ip = clientIp(req);
    let userId: string | null = null;
    let authenticating = false;
    let recent: number[] = [];
    alive.set(ws, true);

    const send = (message: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(message));
    const bye = (reason: Extract<ServerMessage, { t: 'bye' }>['reason']) => {
      send({ t: 'bye', reason });
      ws.close(reason === 'unauthenticated' ? 4401 : reason === 'replaced' ? 4409 : reason === 'shutdown' ? 1012 : 4400, reason);
    };

    const helloTimer = setTimeout(() => !userId && bye('unauthenticated'), options.helloTimeoutMs ?? 8000);

    ws.on('pong', () => alive.set(ws, true));
    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (userId) manager.detach(userId, connectionId);
    });
    ws.on('error', () => ws.terminate());

    ws.on('message', async (data, isBinary) => {
      const now = Date.now();
      recent = recent.filter((t) => now - t < 10_000);
      recent.push(now);
      if (isBinary || recent.length > MAX_MESSAGES_PER_10S) return bye('protocol');

      const message = parseClientMessage(data.toString());
      if (!message) return bye('protocol');
      if (message.t === 'ping') return void send({ t: 'pong' });

      if (message.t === 'hello') {
        if (userId || authenticating) return bye('protocol');
        authenticating = true;
        const verified = await verifyToken(message.token);
        authenticating = false;
        if (!verified) return bye('unauthenticated');
        if (ws.readyState !== ws.OPEN) return;
        userId = verified;
        clearTimeout(helloTimer);
        manager.attach(userId, { id: connectionId, sendSnapshot: (snapshot) => void send({ t: 'snapshot', snapshot }), close: bye });
        return void send({ t: 'welcome', playerId: userId });
      }

      if (!userId) return bye('unauthenticated');
      handleRequest(userId, message, ip, send);
    });
  }

  function handleRequest(userId: string, message: Exclude<ClientMessage, { t: 'hello' | 'ping' }>, ip: string, send: (m: ServerMessage) => void) {
    try {
      // O ack vai ANTES do snapshot resultante só quando a operação não muda nada; nos demais casos o
      // engine emite durante a chamada. O cliente não depende da ordem: o estado é sempre o snapshot.
      if (message.t === 'create') manager.create(userId, message.input, message.me);
      else if (message.t === 'join') manager.join(userId, message.code, message.me, ip);
      else if (message.t === 'resume') manager.resume(userId, message.code);
      else if (message.t === 'leave') manager.leave(userId);
      else manager.dispatch(userId, message.cmd);
      send({ t: 'ack', id: message.id, ok: true });
    } catch (e) {
      if (e instanceof RoomError) return void send({ t: 'ack', id: message.id, ok: false, error: e.code });
      log('request_failed', { type: message.t, error: String(e) });
      send({ t: 'ack', id: message.id, ok: false, error: 'bad_request' });
    }
  }

  // Conexão morta sem FIN (celular sem sinal) não dispara `close`: o ping do protocolo WebSocket descobre.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, options.heartbeatMs ?? 15_000);
  const sweeper = setInterval(() => manager.sweep(), 60_000);

  return {
    http,
    manager,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeat);
        clearInterval(sweeper);
        manager.shutdown();
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => http.close(() => resolve()));
        http.closeAllConnections?.();
      }),
  };
}

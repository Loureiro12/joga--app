import { createServer, type IncomingMessage, type Server } from 'node:http';

import {
  ALPHABET_CATEGORIES,
  BOMB_CATEGORIES,
  IMPOSTOR_RULES,
  PROTOCOL_VERSION,
  RoomError,
  sanitizeContentRequest,
  sanitizeIdentityRequest,
  type ClientMessage,
  type EngineConfig,
  type Scheduler,
  type ServerMessage,
} from '@jogae/engine';
import { WebSocketServer, type WebSocket } from 'ws';

import { createTokenVerifier, type TokenVerifier } from './auth';
import type { Config } from './config';
import { createContentGenerator, type ContentGenerator } from './content/bombContent';
import { createIdentityGenerator, type IdentityGenerator } from './content/whoamiContent';
import { parseClientMessage } from './messages';
import { createMatchRecorder, type MatchRecorder } from './rooms/MatchRecorder';
import { RoomManager } from './rooms/RoomManager';
import { createRoomPresence, type RoomPresence } from './rooms/RoomPresence';
import { FileRoomStore, MemoryRoomStore } from './rooms/RoomStore';

export type RoomServerOptions = {
  verifyToken?: TokenVerifier;
  /** Injetado nos testes para não gastar chamada de API de verdade. */
  contentGenerator?: ContentGenerator | null;
  identityGenerator?: IdentityGenerator | null;
  recorder?: MatchRecorder;
  presence?: RoomPresence;
  engineConfig?: Partial<EngineConfig>;
  scheduler?: Scheduler;
  /** Quanto o cliente tem para mandar o `hello` depois de conectar. */
  helloTimeoutMs?: number;
  heartbeatMs?: number;
  log?: (event: string, data?: Record<string, unknown>) => void;
};

export type RoomServer = { http: Server; manager: RoomManager; close(): Promise<void> };

const MAX_MESSAGE_BYTES = 8 * 1024;
/** Corpo do pedido de conteúdo. A lista de "já vistos" é o que pesa, e 60 frases cabem folgado. */
const MAX_CONTENT_BODY_BYTES = 16 * 1024;
/**
 * Gerações por usuário a cada 10 minutos.
 *
 * Uma partida pede uma vez, então 6 é folga para quem está jogando e teto para quem não está.
 * Existe porque cada chamada custa dinheiro de verdade — é limite de carteira, não de abuso.
 */
const MAX_CONTENT_PER_10MIN = 6;
/** Um cliente legítimo manda poucas mensagens por minuto; isso barra loop acidental e abuso. */
const MAX_MESSAGES_PER_10S = 60;

export function createRoomServer(config: Config, options: RoomServerOptions = {}): RoomServer {
  const startedAt = Date.now();
  const log = options.log ?? (config.env === 'test' ? () => {} : (event, data) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data })));
  const verifyToken = options.verifyToken ?? createTokenVerifier(config, fetch, log);
  const contentGenerator = options.contentGenerator !== undefined ? options.contentGenerator : createContentGenerator(config, log);
  const identityGenerator = options.identityGenerator !== undefined ? options.identityGenerator : createIdentityGenerator(config, log);
  const manager = new RoomManager({
    store: config.storeDir ? new FileRoomStore(config.storeDir) : new MemoryRoomStore(),
    /**
     * Conteúdo gerado para a sala, pedido no lobby.
     *
     * Hoje só o "Quem Sou Eu?" usa: ele é o único jogo com tempo morto de verdade antes de
     * começar, e o único cujo conteúdo (nome, aliases e duas dicas por identidade) é caro o
     * bastante para a geração valer a chamada. Os outros rodam com os bancos locais.
     */
    contentFor: async (gameId, settings) => {
      if (gameId !== 'whoami' || !identityGenerator) return null;
      const request = sanitizeIdentityRequest({
        categories: settings?.categories ?? [],
        difficulties: settings?.difficulties ?? [],
        count: 24,
        avoidNames: [],
      });
      if (!request) return null;
      const { identities } = await identityGenerator.generate(request);
      return identities;
    },
    recorder: options.recorder ?? createMatchRecorder(config, log),
    presence: options.presence ?? createRoomPresence(config, log),
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

    /**
     * Conteúdo novo para a Bomba-Relógio, gerado por IA.
     *
     * Fica no servidor pela chave da Anthropic, que não pode viajar dentro do bundle do app. Pede
     * autenticação porque cada chamada custa, e responde `{ challenges, themes }` — possivelmente
     * vazio. **Vazio não é erro:** o app sempre tem o banco local, e a rodada nunca espera por aqui.
     */
    if (req.method === 'POST' && req.url?.split('?')[0] === '/api/bomb/content') {
      return void handleContentRequest(req, json);
    }

    /**
     * Identidades novas para o "Quem Sou Eu?".
     *
     * O app pede isto **no lobby**, enquanto as pessoas entram na sala. É o tempo morto mais
     * generoso que o app tem, e por isso este é o jogo em que a geração cabe inteira sem ninguém
     * esperar. Vazio continua não sendo erro: o banco local tem 168 identidades.
     */
    if (req.method === 'POST' && req.url?.split('?')[0] === '/api/whoami/content') {
      return void handleIdentityRequest(req, json);
    }
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
    // Página de convite do site (jogaeapp.com.br/j/4827). Público de propósito: quem tem o código já pode entrar na sala.
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

  const contentHits = new Map<string, number[]>();
  const contentLimiter = (userId: string) => {
    const now = Date.now();
    const recent = (contentHits.get(userId) ?? []).filter((t) => now - t < 600_000);
    recent.push(now);
    contentHits.set(userId, recent);
    if (contentHits.size > 5000) contentHits.clear();
    return recent.length <= MAX_CONTENT_PER_10MIN;
  };

  /**
   * O que os dois endpoints de conteúdo têm em comum: token, limite de carteira e corpo.
   *
   * Devolve `{ ok: false }` quando já respondeu um erro. **Não** devolve o corpo em caso de
   * falha e não usa `null` como sinal: um corpo que é literalmente `null` é JSON válido, e
   * confundir os dois deixaria a requisição pendurada sem resposta nenhuma.
   *
   * A ordem importa: o corpo é lido ANTES de autenticar, para não deixar uma conexão pendurada
   * mandando bytes enquanto se consulta o Auth.
   */
  async function lerPedido(req: IncomingMessage, json: (status: number, body: unknown) => void): Promise<{ ok: true; body: unknown } | { ok: false }> {
    const token = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''))?.[1];
    if (!token) return json(401, { error: 'unauthenticated' }), { ok: false };

    let corpo = '';
    try {
      for await (const chunk of req) {
        corpo += chunk;
        if (corpo.length > MAX_CONTENT_BODY_BYTES) return json(413, { error: 'too_large' }), { ok: false };
      }
    } catch {
      return json(400, { error: 'bad_request' }), { ok: false };
    }

    const userId = await verifyToken(token);
    if (!userId) return json(401, { error: 'unauthenticated' }), { ok: false };
    if (!contentLimiter(userId)) return json(429, { error: 'rate_limited' }), { ok: false };

    try {
      return { ok: true, body: JSON.parse(corpo) };
    } catch {
      return json(400, { error: 'bad_request' }), { ok: false };
    }
  }

  async function handleContentRequest(req: IncomingMessage, json: (status: number, body: unknown) => void): Promise<void> {
    if (!contentGenerator) return json(503, { error: 'content_unavailable' });
    const lido = await lerPedido(req, json);
    if (!lido.ok) return;

    const variante = (lido.body as { variant?: unknown })?.variant;
    const request = sanitizeContentRequest(lido.body, variante === 'alfabeto' ? ALPHABET_CATEGORIES : BOMB_CATEGORIES);
    if (!request) return json(400, { error: 'bad_request' });

    json(200, await contentGenerator.generate(request));
  }

  async function handleIdentityRequest(req: IncomingMessage, json: (status: number, body: unknown) => void): Promise<void> {
    if (!identityGenerator) return json(503, { error: 'content_unavailable' });
    const lido = await lerPedido(req, json);
    if (!lido.ok) return;

    const request = sanitizeIdentityRequest(lido.body);
    if (!request) return json(400, { error: 'bad_request' });

    json(200, await identityGenerator.generate(request));
  }

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

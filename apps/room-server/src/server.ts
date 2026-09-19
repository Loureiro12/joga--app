import { createServer, type Server } from 'node:http';

import { IMPOSTOR_RULES } from '@jogae/engine';

import type { Config } from './config';

/**
 * Servidor HTTP base. Hoje só expõe `/healthz` (usado pelo Fly.io e pelo CI);
 * no passo 3 o upgrade de WebSocket das salas é pendurado neste mesmo servidor.
 */
export function createRoomServer(config: Config): Server {
  const startedAt = Date.now();
  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          env: config.env,
          uptimeSec: Math.round((Date.now() - startedAt) / 1000),
          // Prova de que o engine compartilhado está ligado ao servidor.
          games: { impostor: { minPlayers: IMPOSTOR_RULES.minPlayers, roundSeconds: IMPOSTOR_RULES.roundSeconds } },
        }),
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
}

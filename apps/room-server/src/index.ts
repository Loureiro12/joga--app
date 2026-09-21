import { loadConfig } from './config';
import { createRoomServer } from './server';

const config = loadConfig();
const server = createRoomServer(config);

server.http.listen(config.port, () => {
  console.log(`[room-server] ${config.env} · auth=${config.authMode} · ws://0.0.0.0:${config.port}/ws · salas ${config.storeDir ? `gravadas em ${config.storeDir}` : 'só em memória'} · histórico ${config.supabaseServiceRoleKey ? 'ligado' : 'DESLIGADO (sem SUPABASE_SERVICE_ROLE_KEY)'}`);
});

// Fly.io manda SIGTERM no deploy: grava as salas, avisa os clientes e sai. Eles reconectam sozinhos.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[room-server] ${signal} recebido, encerrando`);
    server.close().then(() => process.exit(0));
  });
}

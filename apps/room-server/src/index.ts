import { loadConfig } from './config';
import { createRoomServer } from './server';

const config = loadConfig();
const server = createRoomServer(config);

server.listen(config.port, () => {
  console.log(`[room-server] ${config.env} ouvindo em :${config.port}`);
});

// Fly.io manda SIGTERM no deploy: para de aceitar conexões e sai limpo.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[room-server] ${signal} recebido, encerrando`);
    server.close(() => process.exit(0));
  });
}

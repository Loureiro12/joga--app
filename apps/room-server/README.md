# @jogae/room-server

Servidor de salas em tempo real. **Estado: esqueleto da fundação** — sobe um HTTP com `/healthz` e prova que o `@jogae/engine` está ligado. O protocolo WebSocket, a reconexão e a persistência entram no passo 3 de [docs/backend-plan.md](../../docs/backend-plan.md).

```bash
cp .env.example .env
npm run room-server            # da raiz; ou `npm run dev` aqui
curl localhost:8787/healthz
npm test -w @jogae/room-server
```

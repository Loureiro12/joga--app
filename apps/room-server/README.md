# @jogae/room-server

Servidor de salas em tempo real do Jogaê: Node + WebSocket, executando o `RoomEngine` de `@jogae/engine`.

```bash
cp .env.example .env            # preencha SUPABASE_URL / SUPABASE_ANON_KEY
npm run room-server             # da raiz; ws://0.0.0.0:8787/ws e GET /healthz
npm run bots -- --code 1234     # 3 bots entram na sala 1234
npm run bots -- --host          # um bot cria a sala e conduz a partida
npm test -w @jogae/room-server
```

| Arquivo | Papel |
|---|---|
| `src/server.ts` | HTTP + upgrade de WebSocket, handshake (`hello` → token → `welcome`), limites por conexão, ping |
| `src/auth.ts` | Confere o token no Supabase; tokens `dev:<id>` só quando `AUTH_MODE` permite (nunca em produção) |
| `src/messages.ts` | Validação de tudo que chega do cliente |
| `src/rooms/RoomManager.ts` | Salas ativas, código único, um usuário por sala, snapshot individual, limite de tentativas, limpeza |
| `src/rooms/RoomStore.ts` | Persistência das salas (arquivo por sala) para sobreviver a reinício |
| `src/dev/bots.ts` | Bots de desenvolvimento |

As regras do jogo **não** moram aqui: estão em `packages/engine`. Este pacote é só transporte, identidade e persistência.

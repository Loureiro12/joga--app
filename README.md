# Jogaê

"Mestre do jogo digital" para grupos de amigos: o host cria uma sala, o grupo entra pelo próprio celular e o app conduz papéis secretos, rodadas, votação e placar.

```
apps/
  mobile/        App Expo (iOS + Android). Sem variáveis de ambiente roda 100% simulado.
  room-server/   Servidor de salas em tempo real (Node + WebSocket).
  site/          jogaeapp.com.br — landing, convites, páginas legais, .well-known (Astro). Fora dos workspaces, com lockfile próprio.
packages/
  engine/        Tipos, regras dos jogos, protocolo e o RoomEngine (a sala como máquina de estados).
  db/            Tipos do banco gerados pelo Supabase CLI.
supabase/        Config local, migrations e seed (Auth, Postgres, Edge Functions).
docs/            backend-plan.md (arquitetura e passos) · deploy-fly.md (servidor) · site.md (site) · login-social.md (Google e Apple)
design_handoff_jogae/   Referência de design (protótipo + design system).
```

## Comandos (da raiz)

```bash
npm install
npm run ios | android        # app
npm run room-server          # servidor de salas em modo watch (ws://…:8787/ws · /healthz)
npm run bots -- --code 1234  # bots entram numa sala real (teste com um celular só)
npm run check                # typecheck + testes + smoke — o mesmo que o CI roda
npm run db:start             # Supabase local (precisa do Docker rodando)
npm run db:reset             # recria o banco aplicando migrations + seed
npm run db:types             # regenera packages/db a partir do projeto Supabase linkado
npm run test:db              # testes de integração (conta, perfil, histórico) contra o Supabase local
npm run verify:history       # joga uma partida real e confere o histórico no Supabase de dev
npm run site                 # site em http://localhost:4321  (antes: npm --prefix apps/site install)
npm run site:check           # tipos + build + teste de fumaça do site
```

Para o app usar o Supabase em vez dos serviços simulados, copie `apps/mobile/.env.example` para `apps/mobile/.env.local` e preencha com os valores que o `npm run db:start` imprime.

Builds do EAS rodam de dentro de `apps/mobile` (`cd apps/mobile && eas build …`).

## Jogar de verdade em dev (celular + servidor de salas)

1. `cp apps/room-server/.env.example apps/room-server/.env` e preencha `SUPABASE_URL` / `SUPABASE_ANON_KEY` (os mesmos de `apps/mobile/.env.local`). Deixe `AUTH_MODE=supabase+dev` para poder usar bots.
2. `npm run room-server`
3. Em `apps/mobile/.env.local`, acrescente `EXPO_PUBLIC_ROOM_SERVER_URL=ws://IP-DO-MAC:8787/ws` (descubra o IP com `ipconfig getifaddr en0`; celular e Mac na mesma rede Wi-Fi).
4. `cd apps/mobile && npx expo start --clear` — o `--clear` é obrigatório depois de mexer em `.env`: o cache do Metro guarda as variáveis antigas embutidas.
5. Crie uma sala no app e rode `npm run bots -- --code <código>` para encher o lobby. Ou `npm run bots -- --host` para um bot criar a sala e você entrar como convidado.

## Como as peças se falam

- **Engine no meio de tudo**: o `RoomEngine` é a sala. O modo simulado do app é "engine + bots" (`MockRoomService`); o servidor é "engine + WebSockets". Mesmas regras, mesmas fases, mesma migração de host.
- **App ↔ servidor**: `RemoteRoomService` fala o protocolo de `@jogae/engine` por WebSocket, autenticado com o token do Supabase. O app escolhe entre remoto e simulado em `apps/mobile/src/services/index.ts`, por variável de ambiente.
- **Supabase**: tudo que é durável (conta, perfil, amigos, histórico, assinatura).

O plano completo, com decisões e pendências de produto, está em [docs/backend-plan.md](docs/backend-plan.md).

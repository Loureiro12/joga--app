# Jogaê

"Mestre do jogo digital" para grupos de amigos: o host cria uma sala, o grupo entra pelo próprio celular e o app conduz papéis secretos, rodadas, votação e placar.

```
apps/
  mobile/        App Expo (iOS + Android). Hoje roda 100% com serviços simulados.
  room-server/   Servidor de salas em tempo real (Node + WebSocket). Esqueleto.
packages/
  engine/        Tipos do domínio + regras puras dos jogos. Compartilhado por app e servidor.
  db/            Tipos do banco gerados pelo Supabase CLI.
supabase/        Config local, migrations e seed (Auth, Postgres, Edge Functions).
docs/            backend-plan.md — arquitetura do backend e o passo a passo.
design_handoff_jogae/   Referência de design (protótipo + design system).
```

## Comandos (da raiz)

```bash
npm install
npm run ios | android        # app
npm run room-server          # servidor de salas em modo watch (:8787/healthz)
npm run check                # typecheck + testes + smoke — o mesmo que o CI roda
npm run db:start             # Supabase local (precisa do Docker rodando)
npm run db:reset             # recria o banco aplicando migrations + seed
npm run db:types             # regenera packages/db a partir do banco local
npm run test:db              # testes de integração de conta e perfil contra o Supabase local
```

Para o app usar o Supabase em vez dos serviços simulados, copie `apps/mobile/.env.example` para `apps/mobile/.env.local` e preencha com os valores que o `npm run db:start` imprime.

Builds do EAS rodam de dentro de `apps/mobile` (`cd apps/mobile && eas build …`).

## Como as peças se falam

- **App ↔ engine**: o app importa tipos e regras de `@jogae/engine`. O `MockRoomService` usa essas regras como um servidor em memória.
- **Servidor ↔ engine**: o servidor de salas vai executar as mesmas regras; trocar o mock pelo servidor real é implementar `RoomService` sobre WebSocket e mudar uma linha em `apps/mobile/src/services/index.ts`.
- **Supabase**: tudo que é durável (conta, perfil, amigos, histórico, assinatura).

O plano completo, com decisões e pendências de produto, está em [docs/backend-plan.md](docs/backend-plan.md).

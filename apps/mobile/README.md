# @jogae/mobile

> Parte do monorepo — veja o [README da raiz](../../README.md). Os comandos abaixo rodam nesta pasta; da raiz use `npm run ios`, `npm run android`, `npm run check`.

App mobile de jogos sociais: o host cria uma sala, o grupo entra pelo próprio celular e o app conduz papéis secretos, rodadas, votação e placar. Expo SDK 57 · React Native · TypeScript · expo-router · Zustand · Reanimated.

**Alvos: iPhone (sem iPad) e Android.** Interface em português do Brasil — `pt-BR` é a única localização declarada, então o app fica em português mesmo num aparelho configurado em outro idioma.

**Estado atual: fase 1** — as 28 telas do handoff (`design_handoff_jogae/`) com dados simulados. Nenhum backend é necessário para rodar.

## Rodar

```bash
npm install
npm run ios        # ou: npm run android · `npm run web` existe só como harness de teste
npm run typecheck  # tsc
npm run smoke:room # joga uma partida inteira contra o mock (host + convidado)
npm run icons      # regenera assets/*.png a partir de assets/source/*.svg (precisa do Chrome)
```

Para testar como **convidado**, entre na sala `4827` (qualquer outro código dá "Sala não encontrada"). Dentro de uma partida, o botão **DEV** no canto superior esquerdo (só em `__DEV__`) simula queda de conexão, host saindo, jogadores insuficientes e o avanço do host.

## Arquitetura

```
src/
├─ app/          Rotas do expo-router. Arquivos de 1 linha: só reexportam a tela da feature.
├─ core/         Design system e infraestrutura. Não conhece nenhuma feature.
│  ├─ theme/        tokens (cores, raios, espaçamento, sombras) e fontes
│  ├─ ui/           Button, Input, Chip, Avatar, Screen, ModalCard, BottomSheet, Toast, Skeleton…
│  ├─ animation/    Enter (in/pop), Pulse, Shake, Dots, Spinner — as animações do handoff
│  ├─ illustrations/ SVGs (olhos, dado, troféu, máscara, logo)
│  ├─ navigation/   routes.ts (todas as rotas) e a tab bar
│  └─ utils, hooks  haptics, storage, format, useAsync
├─ features/     Uma pasta por domínio: telas + componentes + store + contrato de serviço.
│  ├─ match/        o fluxo de partida (ver abaixo)
│  ├─ catalog/      jogos, Home, Explorar, Detalhes
│  ├─ auth/ · onboarding/ · profile/ · settings/ · social/ · history/ · premium/ · ai/
└─ services/     Composition root: escolhe a implementação de cada serviço.
```

Regra de dependência: `app → features → core`. Features falam entre si só por stores e serviços públicos; `core` nunca importa de `features`.

### Serviços atrás de interfaces

Cada integração externa é uma interface com uma implementação mock ao lado:

| Interface | Fase 2 |
|---|---|
| `RoomService` (`features/match/services`) | Supabase Realtime ou Firebase RTDB |
| `AuthService` | Supabase Auth / expo-auth-session (Google, Apple, e-mail, anônimo) |
| `BillingService` | RevenueCat — produtos `jogae_monthly` / `jogae_yearly`, entitlement `premium` |
| `AiGameService` | endpoint próprio com LLM |
| `SocialService`, `HistoryService`, `ProfileService` | tabelas do backend |

**Migrar para o backend real = escrever a classe nova e trocar uma linha em `src/services/index.ts`.** Telas e stores dependem só das interfaces.

### O fluxo de partida é dirigido pelo servidor

1. `RoomService` emite um `RoomSnapshot` — tudo o que *este* cliente pode ver (sala, jogadores, rodada, o papel secreto dele, quem já votou, resultado, placar). Votos alheios e a palavra dos outros nunca chegam ao cliente.
2. `matchStore` apenas espelha o último snapshot e o estado da conexão. Não tem regra de jogo.
3. `useMatchNavigator` mapeia `room.phase` → tela (`lobby → role_reveal → clues → voting → revealing → finished | closed`). Quando o host avança, todos os celulares trocam de tela juntos; host e convidado usam o mesmo caminho e as telas só escondem os controles de host.
4. Comandos (`startMatch`, `castVote`, `setPaused`…) vão direto para `services.room`; o efeito volta como um novo snapshot.

As regras do Impostor (sorteio, apuração, pontos) e os tipos do domínio moram em [`@jogae/engine`](../../packages/engine) — o mesmo código que o servidor de salas executa. O `MockRoomService` as usa como um servidor em memória, com bots e os timings do handoff (entrada a cada 900 ms, votos a cada 1,1 s, revelação em 0 → 1,6 s → 3,3 s, reconexão em 6 s).

### Adicionar um jogo

1. Item novo em `features/catalog/data/games.ts` — já aparece na Home/Explorar/Detalhes como "Em breve".
2. Módulo de regras em `packages/engine/src/games/` e, se as fases forem outras, telas novas em `features/match/screens` + entradas no `routeForSnapshot`.
3. `playable: true`.

## Notas para a fase 2

- **Cronômetro**: o snapshot hoje traz `remainingSec` contado pelo mock. No backend real, envie `endsAt` e derive os segundos no cliente para não depender de um tick por segundo na rede.
- **`ackRole`**: o mock avança para as pistas assim que o jogador local confirma; o servidor real deve esperar todos (ou um timeout).
- **Deep link**: `src/app/j/[code].tsx` já abre Entrar na sala com o código. Falta configurar universal links (`associatedDomains` no iOS, `intentFilters` no Android) para `jogaeapp.com.br`.
- **Sons**: a configuração existe, mas não há assets de áudio no handoff — nada toca ainda.
- **Username, amigos, histórico, conquistas**: reais com o Supabase configurado; simulados sem ele.
- **Premium e criar jogo com IA**: escondidos por `src/core/config/features.ts` até o passo 6 (a compra ainda é simulada).

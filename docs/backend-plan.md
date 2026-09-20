# Plano do backend do Jogaê

Decidido em 2026-09-19. Este documento diz **o que** o backend precisa fazer, **com que tecnologia**, **em que ordem**, e o que ainda depende de decisão de produto. Atualize-o quando um passo terminar ou uma decisão mudar.

**Estado:** passos 1 (fundação) e 2 (conta e perfil) concluídos. Passos 3–7 não iniciados.

## 1. O que o app exige

O app (`apps/mobile`) já define os contratos — cada um é uma interface com uma implementação simulada ao lado. O backend existe para substituir essas simulações.

| Contrato no app | O que precisa existir |
|---|---|
| `RoomService` | Sala em tempo real: código de 4 dígitos, fases comandadas pelo host, papel secreto por jogador, votos ocultos até a revelação, revelação sincronizada, pausa, reconexão com 30 s de tolerância, "host saiu" |
| `AuthService` | Google, Apple, e-mail + senha, convidado, redefinição de senha |
| `ProfileService` | Nome, cor e username único (case-insensitive) |
| `SocialService` | Amigos por link de convite, "jogando agora" |
| `HistoryService` | Partidas, colocação, pontos, estatísticas, conquistas |
| `BillingService` | Planos mensal/anual com 7 dias grátis; direito `premium` |
| `AiGameService` | Sugestão de jogo a partir de um texto livre (premium) |

São três naturezas de trabalho diferentes: **tempo real com segredo** (a sala), **dados duráveis** (o resto do banco) e **integrações** (login social, loja, push, LLM).

## 2. Stack

| Necessidade | Tecnologia |
|---|---|
| Login, banco, regras de acesso, funções | **Supabase** (Auth + Postgres com RLS + Edge Functions), região São Paulo |
| Salas em tempo real | **Servidor próprio em Node + TypeScript + WebSocket** (`apps/room-server`), hospedado no Fly.io na região `gru` |
| Regras e tipos | **`@jogae/engine`**, importado pelo app e pelo servidor |
| Assinatura | **RevenueCat** → webhook → Edge Function → tabela `entitlements` |
| Push | **Expo Push**, disparado pelo servidor de salas |
| IA | Edge Function chamando a **API do Claude** com saída estruturada (modelo a definir na implementação, por custo × qualidade) |
| Erros e logs | **Sentry** no app e no servidor |

### Por que a sala não fica no Supabase

O `MockRoomService` já **é** um servidor de salas: um objeto em memória por sala, com timers, que entrega a cada jogador só a visão dele (`snapshot()`). Portar é trocar os bots por conexões reais.

No Supabase puro a mesma lógica viraria linhas + RLS + funções SQL, e três coisas ficam frágeis:

1. **O segredo passa a depender de policy.** Hoje o impostor não vaza porque o servidor nunca envia o dado. Com RLS, uma policy errada vaza o impostor para a sala inteira — e nada quebra para avisar.
2. **Concorrência.** Dois votos chegando juntos precisam de trava para o "todos votaram" disparar uma vez só. Num processo por sala isso não existe: é uma fila.
3. **Timers.** A revelação em 0 → 1,6 s → 3,3 s e a tolerância de 30 s precisam de relógio no servidor; o banco não tem timer de fração de segundo.

Supabase-only continua sendo o **plano B** se um dia a prioridade for ter uma plataforma só (é o que o handoff de design sugere).

### Custos e riscos assumidos

- **Duas plataformas** para operar em vez de uma.
- **Deploy derruba salas em memória.** Mitigação: o servidor grava o estado da sala a cada transição e o app já tem a tela "Reconectando…" de 30 s, que absorve o reinício.
- **Uma instância só.** Suficiente por muito tempo (uma sala gera dezenas de mensagens por partida). Quando não for, roteia-se por código de sala ou porta-se o `engine` para Cloudflare Durable Objects — por isso o `engine` é TypeScript puro, sem Node.
- **Código de 4 dígitos = 9.000 salas simultâneas no máximo.** O código é único só entre salas ativas e é reciclado. Entradas erradas em sequência têm limite por IP/usuário, senão dá para invadir festas alheias por força bruta.

> Região do Fly, preços e limites de plano não foram verificados nesta sessão — confirme ao criar as contas.

## 3. Arquitetura

```
App (Expo)
 ├─ supabase-js ──► Supabase: Auth · Postgres + RLS · Edge Functions
 └─ WebSocket ────► Servidor de salas (Node, Fly gru)
                      ├─ @jogae/engine  (mesmas regras que o app)
                      ├─ valida o JWT do Supabase na conexão
                      └─ service role ──► Postgres (partidas, placar, salas ativas)

RevenueCat ─ webhook ─► Edge Function ─► entitlements
Edge Function ─► API do Claude        Servidor de salas ─► Expo Push
```

O app nunca fala com o banco sobre a partida em andamento; só o servidor de salas escreve o resultado, no fim.

## 4. Passos

Cada passo termina trocando um mock por uma implementação real em `apps/mobile/src/services/index.ts`, sem tocar em tela.

### Passo 1 — Fundação ✅

- Monorepo com npm workspaces: `apps/mobile`, `apps/room-server`, `packages/engine`, `supabase/`.
- Tipos do domínio e regras do Impostor extraídos do app para `@jogae/engine`, com testes das regras.
- `apps/room-server`: esqueleto com `/healthz` e encerramento limpo em `SIGTERM`.
- `supabase/`: config local (login anônimo ligado, redirects `jogae://`), migration de base (`set_updated_at`).
- CI (`.github/workflows/ci.yml`): typecheck, testes, smoke do `RoomService`, `expo-doctor` e migrations aplicadas do zero.

**Ainda depende de você** (precisa das suas contas): criar os projetos Supabase `jogae-dev` e `jogae-prod` em São Paulo, rodar `supabase link`, e guardar `SUPABASE_ACCESS_TOKEN` + senha do banco nos secrets do GitHub para o deploy de migrations.

### Passo 2 — Conta e perfil ✅

- `profiles (id → auth.users, name, username, color)` com RLS: logados leem todos os perfis; cada um edita só o seu, e só `name`, `username` e `color`. Ninguém insere nem apaga pela API.
- O perfil nasce por **trigger** quando o usuário é criado no Auth (inclusive convidado), com username derivado do nome e sufixo numérico em caso de colisão.
- Username é `text` minúsculo (`^[a-z0-9_.]{3,20}$`) com índice único e lista de reservados. O `citext` cogitado no passo 1 foi descartado: com minúsculas obrigatórias ele não agrega nada e tinha uma pegadinha de `search_path`.
- `SupabaseAuthService`: e-mail + senha, convidado (login anônimo), **convidado → conta mantendo o mesmo id**, redefinição de senha por deep link com PKCE (`jogae://reset-password?code=`), Apple nativo no iOS (`signInWithIdToken` com nonce) e Google pelo navegador do sistema.
- **Excluir conta**: função `delete_my_account()` (security definer) que apaga o usuário do Auth; o resto cai em cascata pelos FKs. Botão em Configurações com confirmação.
- O app escolhe a implementação por ambiente: com `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` usa o Supabase; sem elas, continua 100% simulado.
- Testes de integração (`npm run test:db`) rodam as classes reais do app contra o Supabase local.

**Desvios do plano original, e por quê:**

- *Google por navegador, não SDK nativo.* O SDK nativo exige client IDs de iOS/Android e um config plugin que quebra o build sem eles. O fluxo web só precisa do client ID + secret configurados no painel do Supabase. Dá para trocar depois sem mexer em tela (é só o `PlatformAuth`).
- *Excluir conta por função SQL, não Edge Function.* Uma função a menos para publicar e operar, e é testável junto com as migrations. Se um dia a exclusão precisar chamar serviços externos (RevenueCat, storage), vira Edge Function.
- *`settings` não entrou em `profiles`.* Só `notif` interessa ao servidor, e só no passo 5 (push). Entra lá.

**Ainda depende de você:** criar os projetos no Supabase e, no painel de cada um: ligar *Anonymous sign-ins* e *Manual linking*; cadastrar `jogae://**` em *Redirect URLs*; configurar os provedores Google (client ID + secret do Google Cloud) e Apple (Services ID + chave). Decidir se o cadastro exige confirmação de e-mail — o app trata os dois casos.

**Como foi verificado (2026-09-19):**

- *SQL:* migrations aplicadas num Postgres local com um stub do schema `auth` (roles `anon`/`authenticated`, `auth.users`, `auth.uid()` lendo o `sub` do JWT). Conferidos: perfil criado pelo trigger, colisão e reservados de username, leitura pública para logados, edição só do próprio perfil, insert/delete/colunas de sistema negados, restrições de formato, e exclusão apagando só a própria conta.
- *Cliente:* 12 testes unitários do `SupabaseAuthService` com um Supabase falso (`npm test`).
- *App:* em modo simulado, fluxo de convidado → Configurações → excluir conta → login, tela de nova senha e a partida completa, no build web.

- *Projeto de dev real (2026-09-20, `jogae-dev`):* com as classes do app e a chave pública — convidado entra, perfil nasce pelo trigger, convidado → conta mantém o id e o perfil, username reservado é recusado, senha errada vira `invalid_credentials`, excluir conta apaga o usuário e o login para de funcionar.

**Não verificado:**

- **Os testes de integração (`npm run test:db`) nunca rodaram.** O Docker desta máquina não conseguiu baixar as imagens do Supabase. A primeira execução real será no CI (job `database`) ou quando `npm run db:start` funcionar localmente. Eles cobrem o que o stub não cobre: o Auth de verdade (cadastro, senha errada, convidado → conta, e-mail de redefinição com PKCE).
- `packages/db/src/database.types.ts` foi escrito à mão no formato do gerador; rode `npm run db:types` assim que o stack local subir.
- Login com Google e Apple (precisam das credenciais e de um build nativo) e a tela de nova senha aberta por deep link num aparelho.

### Passo 3 — Servidor de salas

- Protocolo WebSocket: comandos do cliente (`createRoom`, `joinRoom`, `startMatch`, `castVote`…) e um único evento do servidor, o `RoomSnapshot` filtrado por jogador. Os tipos ficam no `engine`.
- Uma sala = um objeto em memória com fila de comandos; timers no servidor; estado gravado a cada transição para sobreviver a reinício.
- Reconexão: o jogador que cai fica `connected: false` por 30 s antes de ser removido; host que não volta encerra a sala (`closedReason: 'host_left'`).
- Cronômetro por **horário de término** (`endsAt`), não um tick por segundo na rede.
- `ackRole` espera todos os jogadores ou um tempo limite (hoje o mock avança no primeiro).
- Limite de tentativas em `joinRoom`.
- No app: `RemoteRoomService` com a mesma interface; `npm run smoke:room` passa a rodar também contra o servidor real; os bots do mock viram cliente de teste de carga.

**Pronto quando:** três celulares físicos jogam uma partida inteira juntos, um deles cai e volta no meio.

### Passo 4 — Histórico e estatísticas

- `matches`, `match_players` (colocação, pontos, vezes impostor, vezes descoberto), `achievements`.
- O servidor de salas grava tudo no fim da partida com a service role.
- `HistoryService` real; conquistas calculadas no servidor.

### Passo 5 — Social

- `friendships`, convite por link (`jogae.app/{username}`), `active_rooms` para o "jogando agora", `push_tokens`.
- Push "Fulano criou uma sala" respeitando a configuração de notificações.
- **Exige um site mínimo em `jogae.app`**: arquivos de universal link (iOS) e app link (Android), página de redefinição de senha, termos e política de privacidade (as lojas pedem as URLs).

### Passo 6 — Assinatura

- RevenueCat com o id do usuário do Supabase; webhook → `entitlements`.
- O premium é conferido **no servidor** (sala, IA), nunca só no app.

### Passo 7 — IA

- Edge Function com checagem de premium, limite de uso e saída validada por schema.
- Bloqueado por design — ver pendência 2 abaixo.

## 5. Pendências de produto

Decisões que o backend força e que ainda não foram tomadas:

1. ~~Excluir conta~~ — resolvido no passo 2 (a tela de confirmação não veio do design; segue o padrão do modal de sair da partida).
2. **Jogos criados por IA não têm tela para serem jogados.** O handoff gera "12 perguntas · 8 desafios · 3 especiais", mas "Começar" abre o Impostor. Sem esse fluxo desenhado, o passo 7 não tem o que alimentar.
3. **Limite do plano grátis.** "Partidas ilimitadas" é benefício premium, mas nada define o limite de quem não paga.
4. ~~Regras de pontuação do Impostor~~ — confirmadas em 2026-09-19: +200 por inocente quando o grupo acerta, +300 para o impostor que escapa, +50 por voto certo, empate = impostor escapa. Cobertas por teste em `packages/engine/test`.
5. **LGPD.** Usuários brasileiros, possivelmente menores (existe a categoria Família): política de privacidade, base legal e fluxo de exclusão de dados.
6. **Host caiu = sala encerra** (como no design) ou o host migra para outro jogador? O plano assume o design.

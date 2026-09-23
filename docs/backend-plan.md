# Plano do backend do Jogaê

Decidido em 2026-09-19. Este documento diz **o que** o backend precisa fazer, **com que tecnologia**, **em que ordem**, e o que ainda depende de decisão de produto. Atualize-o quando um passo terminar ou uma decisão mudar.

**Estado:** passos 1 a 4 concluídos (fundação, conta e perfil, servidor de salas, histórico). Sete jogos jogáveis: Impostor, Quem é Mais Provável, Desafio Secreto e Casal Perfeito (em sala), Bomba-Relógio, Bomba: Alfabeto e Entre Nós (num aparelho só). Passo 5: site e amigos feitos, push a fazer. Premium escondido até o passo 6. Passos 6–7 não iniciados.

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
- **Deploy derruba salas em memória.** Mitigação (implementada e testada): o servidor grava o estado da sala a cada mudança, restaura no boot, e o app reconecta sozinho por trás da tela "Reconectando…" de 30 s.
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

- *Convidado → Google/Apple mantém o usuário* (2026-09-21): o Apple nativo também vincula (`linkIdentity` com ID token) em vez de criar conta nova; e se a identidade já pertence a outra conta, o app entra nela em vez de mostrar "e-mail já tem conta" (que era um beco sem saída). Configuração dos provedores em [login-social.md](login-social.md).

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

### Passo 3 — Servidor de salas ✅

- **`RoomEngine` (em `@jogae/engine`)**: a sala como máquina de estados pura e determinística, com relógio injetado. Todo prazo é um carimbo de tempo no estado e existe um único alarme, armado para o prazo mais próximo — por isso o estado é salvo e restaurado em outro processo sem perder timers. **O mock do app e o servidor executam este mesmo código**: o mock é "engine + bots", o servidor é "engine + WebSockets".
- **Protocolo** (`room/protocol.ts`): JSON sobre WebSocket. `hello` com o token → `welcome`; requisições com `id` → `ack`; o estado chega só como `snapshot`, já filtrado para quem recebe.
- **Segredo por construção**: o snapshot só traz o papel de quem pediu; votos alheios nunca saem; o desfecho (impostor, palavra, pontos) só sai no último dos 3 tempos da revelação — nem o placar entrega o resultado antes.
- **`apps/room-server`**: valida o token perguntando ao Supabase (`/auth/v1/user`, uma vez por conexão); valida toda mensagem; código de 4 dígitos único entre salas ativas; limite de tentativas de entrada por usuário e por IP; ping do WebSocket para achar conexão morta; limite de mensagens por conexão; salas gravadas em disco a cada mudança (`ROOM_STORE_DIR`) e restauradas no boot.
- **Regras de presença**: quem cai mantém vaga e pontos por 30 s. **Se o host sai ou não volta, assume quem está na sala há mais tempo** (decisão de 2026-09-20, no lugar de "a sala encerra" do design). Se alguém sai no meio de uma rodada, ela é sorteada de novo com o mesmo número; abaixo de 3 jogadores no meio da partida, a sala fecha. Papel e votação esperam só quem está conectado.
- **Cronômetro**: o servidor não manda um snapshot por segundo; o app conta localmente a partir do instante em que o snapshot chegou (dispensa relógios sincronizados).
- **No app**: `RemoteRoomService` com a mesma interface do mock (reconexão automática com `resume`, overlay "Reconectando…"), escolhido quando `EXPO_PUBLIC_ROOM_SERVER_URL` está definida. Novos: espera "Aguardando os outros" depois de ver o papel, avisos de troca de host e de novo sorteio, erros da sala traduzidos.
- **Bots de dev** (`npm run bots -- --code 1234`): entram numa sala real pelo WebSocket, reconectam sozinhos e, se virarem host, conduzem a partida. Exigem `AUTH_MODE=dev` ou `supabase+dev` — que o servidor recusa em produção.

**Como foi verificado (2026-09-20):** 26 testes do engine com relógio falso; 13 testes do servidor com clientes WebSocket reais (segredo conferido nos bytes que passaram pelo fio, reconexão, migração de host, limite de tentativas, reinício com restauração do disco); 4 testes ponta a ponta do `RemoteRoomService` contra o servidor; e o app (build web) com login real no Supabase de dev + servidor real + bots, jogando até a rodada 2 com o servidor derrubado e reiniciado no meio.

**Não verificado:** celulares físicos (o critério de pronto — três aparelhos jogando juntos, um caindo e voltando — depende de você); a tela "Aguardando os outros" não chegou a aparecer no teste de navegador porque os bots confirmam rápido (a regra está coberta no engine); comportamento com o app em segundo plano no iOS/Android.

**Hospedagem:** `fly.toml`, Dockerfile e o passo a passo estão em [deploy-fly.md](deploy-fly.md) (preparados em 2026-09-20; a publicação depende da conta do Fly).

**Fica para depois:** trocar o arquivo em disco por tabela quando o servidor ganhar a service role (passo 4); `AbortedScreen` ainda tem a variante "O host saiu da sala", hoje inalcançável.

### Passo 4 — Histórico e estatísticas ✅

- **Boletim no engine** (`RoomEngine.matchRecord()`): só existe quando a partida chega ao fim. Traz colocação "de competição" (1, 1, 3), vitória para todos os empatados no topo, e por jogador quantas vezes foi impostor e quantas escapou. Cada partida tem um id próprio, gerado no início — "jogar novamente" é outra partida.
- **Banco**: `matches`, `match_players` (com o nome e a cor do dia; `user_id` nulo para bot de dev e para conta apagada) e `achievements`. RLS: cada jogador lê só a própria linha do boletim e só as partidas em que jogou; ninguém escreve pela API.
- **Gravação**: só o servidor de salas, com a service role, pela função `record_match(jsonb)` — transacional e **idempotente** (a chave é o id da partida), então o servidor repete em falha transitória sem risco de duplicar. Acontece fora do caminho dos jogadores: nunca atrasa nem derruba a sala.
- **Conquistas** recalculadas do histórico a cada partida gravada (`refresh_achievements`): 🔥 10 partidas até o fim · 🕵️ escapar 3 vezes como impostor (somando partidas) · 👑 vencer 5 partidas.
- **Decisões (2026-09-20)**: só entra partida que chegou ao fim; quem saiu no meio não ganha registro; sala fechada por falta de gente não é gravada; vitória = 1º lugar, e empate no topo dá vitória a todos os empatados.
- **No app**: `SupabaseHistoryService` (lista, estatísticas via `get_my_stats()`, conquistas). "Ontem / Sábado / 28 ago" e os grupos "Esta semana / Semana passada / Agosto" passaram a ser calculados a partir da data real. Conquistas bloqueadas aparecem com cadeado. O contador de amigos do Perfil agora vem do `SocialService` (ainda simulado até o passo 5).
- **Configuração**: `SUPABASE_SERVICE_ROLE_KEY` no `.env` do servidor local e nos secrets do Fly. Sem ela o servidor funciona, mas avisa no boot que o histórico está desligado.

**Como foi verificado (2026-09-21):** SQL num Postgres local com stub do `auth` (só a service role grava; idempotência; RLS de leitura; conquistas nos limiares certos; exclusão de conta preserva o histórico dos outros). 28 testes do engine, 17 do servidor (um boletim por partida, nenhum para partida abandonada, repetição/desistência do gravador) e 21 do app (incluindo os rótulos de data, com virada de semana e de ano). Migration aplicada no `jogae-dev`; **leitura** conferida lá com as classes reais do app, e confirmado que um usuário comum não consegue chamar `record_match` nem inserir em `matches`.

**Não verificado:** a **escrita real** no Supabase (servidor → `record_match` pela REST com a service role) — depende da chave secreta, que eu não leio. `npm run verify:history` faz essa verificação de ponta a ponta assim que a chave estiver em `apps/room-server/.env`. O teste de integração novo (`npm run test:db`) só roda no CI.

### Passo 5 — Social (em andamento)

**5a · Site — feito (2026-09-21).** `apps/site` (Astro): landing, `/j/:codigo`, `/u/:username`, `/privacidade`, `/termos`, `/excluir-conta`, `.well-known`, robots e sitemap, conforme `site_handoff_jogae/`. Publicação em [site.md](site.md).

- O convite de sala consulta um endpoint público novo do servidor de salas, `GET /api/room/:codigo` — só host, jogo, contagem e iniciais; nada secreto; com limite de consultas por IP, porque 9.000 códigos são fáceis de varrer.
- Convite de amizade mudou para `jogaeapp.com.br/u/{username}` (decisão de 2026-09-21), para não colidir com as rotas fixas do site.
- **Domínio: `jogaeapp.com.br`** (Registro.br, DNS apontado para a Vercel em 2026-09-21). O plano falava em `jogae.app`, que não foi registrado; o identificador do app nas lojas continua `app.jogae` — é só um nome, não depende do domínio.
- No app: endereço do site configurável (`EXPO_PUBLIC_SITE_URL`), Termos e Privacidade clicáveis, rota `/u/:username`, botão "Colar código" em Entrar na sala (par do *deferred deep link* do site), e `associatedDomains` / `intentFilters` no `app.json`.
- **Exclusão de conta agora anonimiza o boletim** (`Jogador removido`), porque é o que a página `/excluir-conta` promete. Antes o nome ficava gravado no histórico dos outros.

**Não verificado:** o link abrindo o app de verdade — depende do domínio, do Team ID da Apple, do fingerprint do Play e de um build assinado. O site está publicado na Vercel (https://joga-app-zeta.vercel.app, conferido em 2026-09-21: páginas, 404, `.well-known`, convite consultando o servidor no Fly); o domínio próprio aguardava a publicação da zona no Registro.br.

**5b · Amigos — feito (2026-09-21), falta aplicar a migration e publicar o servidor.**

- **Sem pedido nem aceite**, como o design promete ("quem entrar pelo seu link vira amigo na hora"): abrir `jogaeapp.com.br/u/{username}` chama `add_friend_by_username` e a amizade nasce mútua. Tabela `friendships` com um par por linha (`user_a < user_b`); ninguém escreve nela direto.
- **Convite sobrevive ao login.** A rota `/u/:username` só guarda o convite (`friendInviteStore`, persistido); quem grava é o `useFriendInviteSync`, no layout raiz, assim que há alguém logado. Quem abre o link sem conta vira amigo depois de se cadastrar. *Limite:* quem ainda não tem o app instalado perde o convite (a loja não repassa o link) — precisa tocar no link de novo depois de instalar.
- **"Jogando agora".** O servidor de salas espelha as salas vivas em `active_rooms` (`RoomPresence`, mesma service role do histórico): publica a cada mudança de jogadores/fase, renova a cada minuto, limpa tudo ao subir. Quem lê ignora linha com mais de 3 minutos, então servidor que cai não deixa amigo "jogando" para sempre. Sala no placar final não conta. Falha de escrita nunca afeta a sala.
- **O código da sala só aparece para amigos.** `active_rooms` não é legível por cliente nenhum; o único caminho é `get_my_friends` (`security definer`), que também devolve partidas em comum e vitórias do amigo. "Entrar" só aparece com a sala no lobby; em partida mostra "partida em andamento".
- *Risco aceito:* o @username é público, então dá para montar o link de qualquer pessoa e virar "amigo" dela sem ela ter mandado o link — e aí ver em que sala ela está. Mitigações: limite de 30 adições por hora, e qualquer um dos dois desfaz a amizade (segurar o dedo no amigo → Remover). Se isso virar problema, o caminho é trocar o @username do link por um código de convite secreto.
- A tela Amigos recarrega ao voltar para ela e a cada 20 s.

**Verificado:** as regras do banco num Postgres local (amizade mútua, erros, RLS, presença velha ignorada, exclusão de conta em cascata); presença do servidor com testes (fim a fim com espião + escritor do Supabase com `fetch` falso); serviço do app com cliente falso. **Não verificado:** o teste de integração novo (`npm run test:db`) só roda no CI; e o caminho real servidor → `active_rooms` → tela depende de aplicar a migration e publicar o servidor.

**5c · Push — a fazer.** `push_tokens` e "Fulano criou uma sala" respeitando a configuração de notificações (é aqui que `settings.notif` vai para o servidor). Precisa de build nativo e das credenciais de push (APNs / FCM).

**Conteúdo do Impostor (2026-09-22).** O banco de palavras saiu de 40 para **210 palavras em 7 categorias** (as 4 do handoff mais Animais, Profissões e Objetos), 30 cada — o suficiente para uma partida de 10 rodadas, a maior que o app oferece, nunca repetir palavra. Critério, no comentário do próprio arquivo: substantivo concreto que um grupo brasileiro reconheça e consiga descrever sem dizer o nome, sem nome de pessoa real e sem palavra repetida entre categorias (`usedWords` é único por partida).

- O catálogo do app e o banco do engine são listas separadas, e sair de sincronia falha em silêncio: quem escolhesse uma categoria desconhecida jogaria com outra, sorteada sem avisar. `apps/mobile/test/games.unit.test.ts` agora trava isso nos dois sentidos.
- **As palavras moram no código, então mudá-las exige `fly deploy`** — numa partida real quem sorteia é o servidor. Quando o jogo estiver no ar e você quiser ajustar conteúdo sem publicar versão, o passo é mover o banco para uma tabela no Supabase, que o servidor carrega na subida. Gerar com IA é o passo 7, e o caminho seguro é gerar em lote, revisar e gravar no banco — não na hora da rodada.

**Premium escondido (2026-09-21).** `apps/mobile/src/core/config/features.ts` (`premium: false`) tira da navegação a assinatura e o que depende dela (criar jogo com IA, categorias exclusivas); o site faz o mesmo com `premiumEnabled` em `src/data/content.ts`. Motivo: a compra ainda é simulada, e a App Store rejeita isso. Religar no passo 6.

### Jogo 2 — Quem é Mais Provável? (2026-09-22)

Segundo jogo com partida de verdade. A spec (42 seções) foi entregue em duas etapas; **esta é o núcleo jogável**.

**O motor deixou de ser do Impostor.** `RoomEngine` agora cuida só de SALA — quem entrou, quem caiu, tolerância de 30 s, migração de host, alarme único, salvar/restaurar — e delega a partida a um `GameRules` por jogo (`room/GameRules.ts`). Consequência no protocolo: `RoomSnapshot.round/secret/result/summary` viraram `RoomSnapshot.game`, discriminado por `kind`. No app, `useImpostorMatch()` e `useLikelyMatch()` entregam a view já achatada, então as telas de cada jogo continuam lendo `match.round`.

- **Fases:** `lobby → question → voting → revealing → (question | finished)`. `question` existe para o grupo ler junto: quem abre a votação é o host, que também pode trocar a pergunta — mas só antes do primeiro voto, senão pular seria escolher o resultado.
- **Empate é resultado**, nunca erro: todos com a maior contagem vencem, sem desempate automático. Unanimidade exige que todos os elegíveis tenham votado na mesma pessoa; se o escolhido votou em si, vira "nem ele conseguiu negar".
- **Quem podia votar congela** quando a votação abre. Quem chega depois entra na próxima pergunta; quem sai não leva embora os votos que recebeu (ao contrário do Impostor, que re-sorteia a rodada).
- **Opções do host:** categorias (várias), intensidade (pesado é opt-in), voto em si mesmo, identidade dos votos, pontos. Padrão é casual — sem placar, porque a experiência é social.
- **Conteúdo:** 200 perguntas, 25 por categoria, em `games/likely-questions.ts`. `Família` é toda leve e `Trabalho` não tem pesado — as duas promessas estão travadas por teste. O prefixo "Quem é mais provável de…" fica na tela, nunca no texto.

**Verificado:** 53 testes no engine (regras, banco de perguntas, e a sala jogando o jogo novo de ponta a ponta, incluindo empate, unanimidade, desconexão, saída no meio, partida sem limite e restaurar no meio da votação); smoke do `RoomService` jogando uma partida completa. **Não verificado:** as telas num aparelho de verdade e a gravação no Supabase (o boletim vai com `impostorsCaught: 0`).

**Sem mínimo de produto (2026-09-22).** Nos dois jogos o número de jogadores virou *recomendação*, não regra. O motor guarda só um **piso técnico de 2**, que existe porque abaixo dele a partida trava de verdade: com uma pessoa sozinha não há em quem votar e a votação nunca fecharia. O lobby libera o "Começar" a partir de 2 e, abaixo do recomendado, avisa em vez de bloquear; a sala em andamento só fecha quando sobra uma pessoa.

- No Impostor com 2, o empate 1×1 sempre inocenta o impostor — o jogo fica bobo, mas roda, e quem decide se vale a pena é o grupo.
- `GameRules` passou a ter `minPlayers` (piso) e `recommendedPlayers` (sugestão); o catálogo do app espelha os dois.
- De quebra: `getGame(room.gameId)` não achava o jogo novo, porque o snapshot traz o id do MOTOR (`likely`) e o catálogo usa o seu (`mais-provavel`). Agora existe `getGameByEngine`.

**Fica para a etapa 2:** modo Um Celular (§4, o usuário pediu junto), cronômetro configurável, rodada de desempate, opção "Ninguém", estatísticas sociais (§22), perguntas personalizadas, card de compartilhamento, denunciar pergunta e geração por IA.

**Dívida conhecida:** `MatchRecord` ainda carrega `impostorsCaught` / `timesImpostor` / `timesEscaped`, que são do Impostor — o jogo novo grava zeros. Generalizar isso pede uma migration e mexe nas conquistas.

### Jogo 3 — Bomba-Relógio (2026-09-23)

Terceiro jogo, e o primeiro **sem sala**: um celular só, passando de mão em mão, presencialmente. Não cria sala, não pede conta e não fala com o servidor — forçá-lo no `RoomEngine` seria sincronizar o que não tem o que sincronizar. As regras são funções puras (`games/bomb.ts`) e o estado vive num store local do app (`features/bomb/bombStore.ts`), sem persistência: a partida acontece com todo mundo na mesma mesa, e recuperar uma partida velha ao reabrir o app só confundiria.

O catálogo ganhou `device: 'sala' | 'local'`, e é ele que decide o destino do botão na tela do jogo. Um teste garante que todo jogo jogável sabe por onde começa (motor de sala **ou** local).

- **O tempo é secreto e absoluto.** O pavio é sorteado quando a bomba acende e nunca é recalculado: não depende de quem está com ela nem de quantas passagens houve (§46). É um carimbo de tempo, não um contador de tela — minimizar o app não segura a explosão (§45), e a tela nunca mostra quanto falta (§13).
- **A distribuição não é uniforme** (§15): `u^0.65` empurra a massa para o fim da faixa, então explosão precoce é rara e a tensão cresce. Piso de segurança de 8 s por cima (§16).
- **Passar não reinicia o pavio** (§18), e a responsabilidade muda no toque, não na entrega física (§19) — é o que evita a discussão de "explodiu enquanto eu passava".
- **Sustos** (§38) em ~8% das rodadas, sempre entre 25% e 55% do pavio: perto do fim, um susto viraria aviso.
- Três modos: casual (bombas), eliminação (vidas até sobrar um) e pontos. Ordem circular ou caos, e quem perdeu começa a próxima.
- **Conteúdo:** 180 desafios, 18 em cada uma das 10 categorias, com `pool` estimado por desafio. Pelo menos 12 de cada categoria são de resposta farta, porque num grupo de 8 um desafio curto acaba antes da bomba (§40) — travado por teste.

**Verificado:** 72 testes no engine, incluindo o viés do sorteio, o piso de segurança, o pavio que não reinicia, a explosão depois do app voltar do segundo plano, ordem caos sem repetição, os três modos até o fim, desafio sem repetir e os destaques. **Não verificado:** as telas num aparelho de verdade, e o háptico (não roda no navegador).

**Tensão na tela (2026-09-23).** A rodada ganhou pulso, brasa e tremor enquanto a bomba está acesa. O desenho é ditado por uma restrição: **nada visual pode acompanhar o pavio**. Se a agitação crescesse junto com o tempo, o grupo aprenderia a ler a tela em duas partidas e a incerteza — que é o jogo inteiro — acabaria.

Por isso a animação (`features/bomb/components/BurningFuse.tsx`) **não recebe nem consulta `explodeAt`**: ela sorteia o próprio ritmo, em ondas de calmaria e agitação de 2,5 a 5 s. Às vezes a tela se acalma um segundo antes de estourar; às vezes fica frenética e não acontece nada. Um teste em `games.unit.test.ts` lê o arquivo e falha se ele encostar no estado da bomba — é uma fronteira que só se sustenta se alguém a vigiar.

**Fica de fora por ora:** sons (o projeto não tem assets de áudio), botão de contestação (§27 — a própria spec sugere deixar verbal no MVP), modificadores de rodada (§39), desafios personalizados (§42), IA (§43) e card de compartilhamento (§52). Nada disso está no caminho do resto.

### Log de desenvolvimento (2026-09-23)

O app passou a imprimir no Metro cada requisição e cada troca de tela, em `apps/mobile/src/core/logging/`. Um ponto por canal, escolhido para não deixar buraco quando alguém escrever código novo: o `fetch` do cliente Supabase (pega auth, perfil, histórico, amigos e RPCs de uma vez), o WebSocket do `RemoteRoomService` e o `pathname` do expo-router.

- **Desligado em produção** e sem segredo nem em dev: token, senha e chave são apagados antes de virar texto. No Android, `adb logcat` deixa qualquer app ler esse console.
- `code` precisou de tratamento especial: na volta do OAuth é o código do PKCE (vale uma sessão), nos parâmetros de tela é o código da sala (quatro dígitos que a pessoa grita na mesa). Só o de sala escapa.

**Dois problemas que o log revelou na primeira execução:**

1. **O `PROTOCOL_VERSION` não tinha subido** quando o snapshot mudou de forma (`round/secret/result` → `game`). App novo contra servidor velho se entenderiam mal em silêncio. Agora é **2**, e o servidor recusa quem não bate com `bye protocol`. O helper de teste tinha o número escrito na mão — corrigido para usar a constante.
2. **O servidor no Fly recusa o login do app** (`bye unauthenticated`), e roda código anterior a tudo isto (`minPlayers: 3`, sem `/api/room`). O `createTokenVerifier` engolia o motivo; agora registra status e corpo da resposta do Auth, para separar "token inválido" de "a chave do servidor está errada".

### Sair da partida (2026-09-23)

Antes só havia saída em duas telas: o lobby e a de pistas do Impostor. Quem estivesse revelando o papel, votando ou vendo o resultado ficava preso até a partida acabar — e a Bomba-Relógio, que eu tinha feito como modal sem gesto de voltar, não tinha saída nenhuma.

- **Jogos de sala:** o menu mora em `MatchLayout`, não nas telas. É o que garante que tela nova nasça com saída. O botão fica sempre no mesmo canto, porque quem está no meio de uma votação não deveria procurar onde se sai. Ele reúne pausar, regras e sair — o antigo `PauseModal`, que só existia nas pistas, foi absorvido.
- **Android:** o botão físico de voltar deixou de ser inerte e passa a abrir esse menu. Ele não sai direto: abandonar a partida no reflexo seria cruel.
- **Bomba-Relógio:** não há sala para deixar, o aparelho é do grupo. Então são duas saídas — *encerrar* (vai para o resultado com o que já rolou) e *descartar*. Encerrar só aparece depois da primeira rodada, senão não há resultado nenhum.
- A regra de quais fases têm saída virou `matchPhase.ts`, sem nada de React, e um teste percorre todas as fases. A lista cresce a cada jogo, e uma fase esquecida é exatamente uma tela sem saída.
- **O canto do botão cobrava aluguel (corrigido em 2026-09-23).** Pôr o ✕ num canto fixo fez ele cair em cima do que as telas já escreviam ali — a rodada, a categoria, "só você vê isso". Cinco telas ficaram assim. A primeira linha de tela de partida virou `MatchTopRow`, que reserva o espaço, e um teste reprova a tela nova que abrir uma linha de canto a canto sem ele.

**Verificado:** a Bomba no navegador (o ✕, o modal, o descartar, e "encerrar" ausente antes da primeira rodada) e a ausência correta do menu no lobby. **Não verificado no navegador:** o menu nas fases de partida dos jogos de sala — elas exigem uma sala com três pessoas, e o servidor de produção ainda recusa o login até a chave ser trocada.

### Som da Bomba-Relógio (2026-09-23)

Os áudios saíram de `audio/` na raiz para `apps/mobile/assets/audio/`, que é de onde o Metro empacota. Ficaram em WAV de propósito: são curtos (o tique tem 90 ms) e sem compressão não há atraso de decodificação — num jogo de ritmo isso se ouve. Juntos pesam menos de 300 KB, e só o que `core/audio/sounds.ts` referencia entra no bundle (a demo de 15 s fica de fora).

**O som segue a mesma regra da animação: não pode dizer quanto falta.** `useBombSound` recebe só a fase e o contador de sustos — nunca `explodeAt` — e sorteia o próprio ritmo em ondas de calmaria e agitação. Um tique-taque que acelerasse junto com o pavio seria um cronômetro sonoro, e o grupo aprenderia a contar as batidas.

**`tempo-acabando.wav` toca apenas no susto falso**, e virou a melhor peça do jogo: o grupo ouve o som de fim, o coração dispara, e nada acontece. Um teste garante que ele só é disparado de dentro do susto, e que nem a animação nem o som encostam no estado da bomba.

Respeita a chave `sound` das configurações, pelo mesmo caminho dos hápticos. Sobraram cinco sons do Impostor (`revelar`, `voto`, `acerto`, `entrou`, `impostor-escapou`) já no lugar, ainda não ligados.

**Verificado:** os quatro WAV carregam, a partida vai até a explosão e o console fica limpo. **Não verificado:** o som saindo de verdade — o navegador sem saída de áudio não prova isso, e o mesmo vale para o háptico.

**De quebra:** havia um `yarn.lock` versionado (entrou no commit anterior sem eu notar) num projeto de npm workspaces. Era ele que fazia `expo install` escolher yarn e falhar. Removido e barrado no `.gitignore`.

### Jogo 4 — Bomba-Relógio: Alfabeto (2026-09-23)

Variante da Bomba-Relógio, e por isso **não ganhou motor próprio**: pavio, sustos, ordem, modos, placar e destaques são os mesmos e continuam em `bomb.ts`. O que muda entra como `settings.variant`, e `alphabet.ts` guarda só o que é dela — tema, grade de letras e o desarme. Duplicar as 250 linhas de lógica de sala e modos seria criar dois lugares para o mesmo bug.

- **Tocar a letra é o que passa a bomba** (§6). Não há botão separado, então a jogada é instantânea — e como cada letra só serve uma vez, a rodada aperta sozinha conforme elas somem.
- **Gastar a última letra desarma a bomba**: ninguém perde, todo mundo mantém a sequência, e no modo pontos há bônus (§29–30). É o momento alto do jogo e tem tela própria.
- **Toque inválido não faz nada**, em silêncio: letra de fora do tema, já usada ou bomba apagada. Punir um toque errado no meio da pressa seria injusto.
- **A letra gasta continua na tela**, apagada. Se sumisse, a grade se reorganizaria a cada toque e todo mundo teria de reaprender onde as letras estão bem na hora da pressa.
- **Pavio de 30 a 90 s** (contra 20–60 do clássico) e segurança de 10 s: com as letras sumindo, pensar demora, e um pavio curto viraria sorteio.
- **Conteúdo:** 18 temas com a lista de letras que cada um comporta. Oferecer "X" em Países travaria a rodada — por isso o tema carrega as próprias letras, e o modo Hardcore é quem devolve o A–Z inteiro. Testes travam o mínimo de 14 letras por tema e impedem que K/W/X/Y virem praxe.

**Verificado:** 85 testes no motor (incluindo o desarme, toque inválido, hardcore, e o pavio próprio) e uma partida no navegador que terminou com a bomba desarmada às 20 letras, sem erro no console.

**Pendência conhecida, fora desta entrega:** o repositório não tem `.prettierrc`, e o padrão do Prettier (aspas duplas, 80 colunas) diverge do código (aspas simples, ~160). Rodar `npx prettier --write` hoje reformata o projeto inteiro — já aconteceu nesta sessão e tive de reverter. Vale um commit separado só para isso, com `{ singleQuote: true, printWidth: 160 }`, ignorando `packages/db/src/database.types.ts`, que é gerado.

### Jogo 5 — Entre Nós (2026-09-23)

Jogo de conversa para um casal, local, e o primeiro **sem nenhuma mecânica de competição**: sem vencedor, pontos, cronômetro ou resposta certa. Motor próprio (`games/couple.ts`), porque não há nada em comum com bomba nem com sala — o que existe aqui é ordem de perguntas.

**Quase todo o código é sobre qual carta aparece quando**, porque é aí que está a diferença entre uma noite boa e um interrogatório:

- **Começa leve e desce aos poucos** (§38). Abrir com uma pergunta profunda pede vulnerabilidade de quem ainda nem entrou no clima.
- **Respiro a cada quatro cartas** (§37): uma leve entra no meio das profundas. Um teste garante no máximo três cartas fundas seguidas.
- **`intimidade` é opt-in de verdade.** Não entra no clima "Surpresa", não entra marcando a categoria na mão, e nunca aparece nas primeiras cartas. Três testes cobrem isso, porque é a falha que estragaria a noite de alguém.
- **Trocar a pergunta não gasta a vez** nem pede motivo (§35), e some do resumo — o casal não conversou sobre ela.
- **Aprofundar abre a segunda camada da mesma conversa** (§34), sem trocar de assunto.

**O fim não dá nota** (§56): mostra sobre o que se conversou e nada mais. Nenhuma porcentagem de compatibilidade, nenhum "vocês concordam em 64%", nenhum conselho sobre a relação. Diferença de resposta não é defeito.

**Nada é persistido**, e aqui é mais que simplicidade: o casal acabou de falar de coisas pessoais, e guardar isso sem pedir seria quebra de confiança. Se um dia houver "guardar descobertas", tem de ser ação explícita deles.

**Conteúdo:** 160 cartas em 10 categorias, com follow-ups, e 12 cartas de ação ("diga uma coisa que você admira e quase nunca fala"). A régua de segurança foi a mais dura de todas: nada de trauma, término, infidelidade, fertilidade, saúde, morte, dívida ou conflito familiar, e nenhuma pergunta cujo caminho honesto leve a mágoa — "o que te faz sentir distante de mim?" convida a conversar, "o que você menos gosta em mim?" convida a brigar.

**Fica de fora:** resposta secreta escrita, previsão, escolha entre duas, escala (§27–32), reações, favoritar, memórias, perguntas criadas pelo casal, IA e as sessões prontas tipo Date Night (§49–50).

### Jogo 6 — Desafio Secreto (2026-09-23)

O primeiro jogo que **roda por trás de uma festa**, e não numa sentada: cada um recebe uma missão secreta, tenta cumpri-la durante o rolê e o app some do caminho. Volta a exigir sala, porque cada missão é privada e precisa de um celular por pessoa.

Essa diferença de duração é o que mais mexeu no código:

- **Os prazos da sala são outros.** `GameRules` ganhou `roomConfig`: o Desafio Secreto pede seis horas de tolerância e de sala ociosa. Com o padrão de 30 s e 10 min, quem guardasse o celular seria removido da própria partida e a sala morreria antes da sobremesa.
- **Nada é anunciado na hora.** Marcar "consegui" não avisa ninguém, e acusar não mostra o resultado. Se o app dissesse ao grupo que algo acabou de acontecer, todos deduziriam a missão pelo que tinham acabado de ver.
- **A tela mais importante é a que quase não aparece.** `HoldToReveal`: a missão só existe na tela enquanto o dedo está nela, e some quando o app vai para segundo plano — o seletor de apps mostra a última tela. Um teste impede que uma tela nova do jogo imprima a missão fora desse componente.

**Acusar custa e exige palpite** (§30–33): duas acusações por noite, e não basta apontar — é preciso escolher, entre quatro missões, qual é a do outro. As quatro opções de cada alvo são **sorteadas uma vez, no começo, e nunca mais**. Geradas a cada acusação, daria para abrir a tela várias vezes e cruzar as listas até isolar a verdadeira.

**O lugar muda a noite.** O banco tem 144 missões; 24 delas só existem em um lugar (a churrasqueira, a mala, o placar). O sorteio dá uma missão do lugar por faixa de dificuldade: sem essa preferência, as poucas específicas quase nunca sairiam e escolher "onde vai ser?" não mudaria nada. Isso abriu uma pista que precisou ser fechada no mesmo passo — como as missões do lugar são distribuídas, elas sumiam do banco de opções falsas, e uma lista com três missões de conversa e uma sobre o fogo responderia sozinha. As falsas passaram a ser do mesmo tipo da verdadeira.

**A hora da verdade é do grupo, não do app** (§38–42): as missões abrem uma por vez, quem foi pego primeiro, e o grupo decide se a história aconteceu. Empate valida — na dúvida, a pessoa contou a verdade. A validação vem só no fim porque interromper a noite para julgar cada missão mataria o jogo.

**Verificado no navegador:** a noite inteira com cinco bots — briefing, "segure para ver" (a missão some ao soltar e não vaza no texto da tela), consegui, acusação com as quatro opções, hora da verdade com votação e o fim. Sem erro de console.

**Dois bugs de servidor apareceram nesse passo** e foram corrigidos: `totalRounds: 0` era recusado na criação da sala (o Desafio Secreto não tem rodadas, dura o rolê), e a dificuldade escolhida pelo host era descartada na validação — o grupo jogaria com uma configuração que ninguém pediu.

**Fica de fora:** missões em dupla, missões criadas pelo grupo, foto como prova e a segunda rodada de missões na mesma noite.

### Jogo 7 — Casal Perfeito (2026-09-23)

Os dois respondem em segredo, no próprio celular, e a graça é a espera entre apertar a resposta e descobrir se o outro apertou a mesma. Primeiro jogo em que **a unidade não é o jogador, é a dupla**: placar, sequência, título e estatística são do par.

Isso encostou numa suposição que estava em todo o resto do código — o `RoomEngine` só conhece jogadores. A saída foi não mexer nele: os dois do casal carregam a mesma pontuação no placar da sala, e o jogo guarda o placar de verdade no próprio histórico. Assim o ranking e o boletim do histórico continuam funcionando sem saber o que é um casal.

**O pareamento é de mão dupla** (§7–8): escolher não basta, o outro precisa aceitar. Um toque errado não forma dupla nenhuma, e ninguém é colocado num casal sem saber. A partida só começa quando **toda a sala** tem par — quem ficasse de fora travaria a rodada esperando uma resposta que nunca vem.

**As quatro mecânicas** (§24–31) existem para a partida não virar a mesma pergunta vinte vezes: `who` (quem dos dois), `same` (a mesma pergunta para os dois), `know` (um responde sobre si, o outro prevê, alternando a vez) e `scale` (1 a 5). Só a escala tem meio-termo: errar por um ponto vale metade, porque é a diferença entre "não combinamos" e "chegamos perto" (§42).

**"Quem é mais" compara a pessoa, não a palavra** (§25). Ana marca "Carol" e Carol marca "Eu": são respostas diferentes na tela e a mesma pessoa no servidor. O id da pessoa escolhida viaja junto com o texto para a revelação, porque só o celular de quem está olhando sabe se aquela pessoa é "você" ou um nome.

**A tensão vem de esconder e de contar** — o placar aparece de cinco em cinco perguntas e **some nas três últimas** (§45–46). Terminar sem saber quem está na frente é o que faz a contagem do fim valer alguma coisa. Empate no topo abre desempate: uma pergunta de escala, e vence a menor diferença interna (§48–49).

**Sequência não multiplica ponto** (§41), por recomendação da própria spec: multiplicador decidiria a partida na terceira pergunta e tiraria a graça de quem começou torto. Ela é conquista visual.

**Conteúdo:** 140 perguntas em 9 categorias, e a mais provocativa (`🔥 Casal`) fica fora do "Misturado" — só entra se o host marcar (§21). A régua de segurança seguiu a §59: nada de traição, término, ex, fertilidade, gravidez, sexo explícito, dívida, saúde, trauma, aparência, segredo ou comparação com outro parceiro, e nenhuma pergunta cujo caminho honesto termine em briga. O jogo é jogado na frente dos outros casais, e ninguém escolheu terapia em grupo.

**O fim não dá nota** (§52). Ele mostra quem teve mais respostas iguais *nesta partida*, e diz isso com essas palavras. Nenhuma porcentagem de compatibilidade, nenhum "esse casal se conhece de verdade". O título do casal que menos combinou existe, mas é piada, e um teste reprova qualquer texto de título que soe a veredito.

**Verificado no navegador:** partida de 10 perguntas do começo ao fim com cinco bots — pareamento, as quatro mecânicas, cronômetro, resposta enviada, revelação casal a casal, placar entre rodadas, match final e o resultado com títulos e estatísticas. Sem erro de console.

**Fica de fora:** rodada de aposta (§44), perguntas criadas pelo host (§56), packs premium (§57), IA (§58) e o nome de equipe editável (§10 — cor e emoji são automáticos). A revelação é sempre simultânea, casal a casal na mesma tela; a variante de abrir um casal por vez nas perguntas especiais (§37/§39) não entrou.

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
6. ~~Host caiu~~ — decidido em 2026-09-20: outro jogador assume (o mais antigo na sala que esteja conectado).

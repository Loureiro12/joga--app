# Handoff: Jogaê — app mobile de jogos sociais

## Overview
Jogaê é um "mestre do jogo digital" para grupos de amigos presencialmente juntos. O host escolhe um jogo, cria uma sala com código de 4 dígitos, os demais entram pelo próprio celular e o app conduz papéis secretos, rodadas, cronômetro, votação, revelação e placar. Este pacote cobre **28 telas** (fluxo completo do Impostor + conta, perfil, social, erros) e o design system.

Fluxo prioritário: **Splash → Onboarding → Login → Home → Detalhes → Criar sala → Lobby → Revelação → Rodada → Votação → Aguardando votos → Resultado → Placar → Próxima rodada → Fim.**

## About the Design Files
Os arquivos `.dc.html` deste pacote são **referências de design em HTML** (protótipo navegável + design system), não código de produção. A tarefa é **recriar estas telas em React Native com Expo** (iOS + Android), usando os padrões abaixo. Não copie o HTML; leia-o para extrair valores exatos (cores, tamanhos, cópia, estados) quando o README não bastar.

## Fidelity
**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, raios, cópia e microinterações são finais. Recriar pixel-perfect.

## Stack recomendada
- **Expo SDK (managed) + TypeScript**, `expo-router` para navegação (stack raiz + tabs `Jogar | Explorar | Perfil`; o fluxo de partida é um stack modal em tela cheia **sem** tab bar).
- Fontes via `expo-font` / `@expo-google-fonts/barlow-condensed` (600/700/800) e `@expo-google-fonts/dm-sans` (400/500/600/700).
- Animações: `react-native-reanimated` (revelações, pop, shake, progress) + `expo-haptics` nas revelações/votos.
- Gestos: `react-native-gesture-handler` para "segure para revelar".
- QR: `expo-camera` (leitura) e `react-native-qrcode-svg` (exibição no lobby).
- Ícones/ilustrações: `react-native-svg` — os SVGs estão inline no HTML e portam direto.
- Estado: Zustand (cliente) + camada de "room" abstrata (ver **Backend**).

## Fase 1 = front com dados mockados
Implementar todas as telas com um `MockRoomService` que simula: jogadores entrando (1 a cada 900 ms), votos chegando (1 a cada 1,1 s), revelação em 3 tempos (0 → 1,6 s → 3,3 s), reconexão (6 s). A interface do serviço deve ser trocável depois por Firebase/Supabase sem mudar telas.

## Backend (fase 2 — especificar, não implementar agora)
- **Salas em tempo real**: Supabase Realtime (ou Firebase RTDB). Entidades: `rooms {code(4 dígitos), hostId, gameId, category, rounds, status}`, `players {roomId, userId, name, color, joinedAt, connected}`, `rounds {roomId, index, word, impostorId, starterId, status}`, `votes {roundId, voterId, targetId}`, `scores {roomId, userId, points}`. Só o host muda `status`. Votos ficam ocultos até `status = 'revealing'`. Presença/heartbeat para "Desconectou" e "O host saiu". Timeout de reconexão: 30 s.
- **Login social**: `expo-auth-session` / Supabase Auth com Google e Apple; e-mail+senha; "Entrar como convidado" = sessão anônima com nome + cor.
- **Assinatura**: RevenueCat (`react-native-purchases`), produtos `jogae_monthly` (R$ 14,90) e `jogae_yearly` (R$ 99), trial 7 dias. Entitlement `premium` desbloqueia IA, todos os jogos, categorias exclusivas e partidas ilimitadas.

---

## Design Tokens

### Cores
| Token | Hex | Uso |
|---|---|---|
| primary | `#7C3AED` | marca, CTAs primários, seleção, jogo Impostor |
| primaryLight | `#A78BFA` | links, foco de input, badge premium |
| accent | `#FACC15` | ação/destaque: votar, revelar, código da sala, "ê" do logo, líder |
| background | `#0F0F13` | fundo de tela |
| surface | `#19191F` | cards, inputs, botões secundários |
| surfaceLight | `#27272F` | bordas, toggles off, botões terciários, disabled |
| text | `#FAFAFA` | texto principal (e texto sobre roxo/vermelho) |
| muted | `#A1A1AA` | texto secundário, ícones inativos |
| mutedDark | `#52525B` / `#71717A` | rodapés, texto sobre branco |
| success | `#22C55E` | confirmações, "conectado", jogo Desafio secreto |
| danger | `#EF4444` | erros, impostor, destrutivo, jogo Bomba-relógio |
| resultWin | `#166534` | fundo "Vocês acertaram!" |
| resultLose | `#7F1D1D` | fundo "O impostor escapou" |

Texto sobre amarelo/verde/lilás = `#0F0F13`; sobre roxo/vermelho = `#FAFAFA`.
Cores por jogador (avatar): `#7C3AED`, `#FACC15`, `#22C55E`, `#A78BFA`, `#EF4444`, `#27272F`.

### Tipografia
- **Display/títulos/números/botões**: Barlow Condensed, **caixa alta**.
  - Hero 56–76 / line-height .9 · Título de tela 40–44 / 1 · Título de card 22–28 / .95 · Botão 22 / letter-spacing .5 · Badge-botão 17 · Código da sala 72 / letter-spacing 6.
- **Corpo**: DM Sans. Corpo 17/1.45 (500) · Rótulo 16 (600) · Lista 15–16 (600) · Apoio 12–13 (400/500, muted) · Overline 11 (600, letter-spacing .8, caixa alta, muted) · Badge 10 (600, letter-spacing .6, caixa alta).

### Raios
Cards grandes 28 · cards 24 · cards de lista/inputs 16–20 · botões 18 · chips/badges 99 (pill) · avatar 50%.

### Espaçamento
Padding lateral de tela 20 · topo (abaixo do status bar) 64 · gap entre blocos 18–22 · gap entre itens de lista 8 · gap de chips 8.

### Sombras
Quase nenhuma. Exceções: secret card fechado `0 30px 60px rgba(124,58,237,.35)`; toast `0 12px 30px rgba(0,0,0,.5)`; card do baralho `0 20px 50px rgba(0,0,0,.5)`.

### Animações (Reanimated)
- `in`: opacity 0→1, translateY 14→0, scale .96→1, 450–600 ms, cubic-bezier(.2,.8,.2,1).
- `pop`: scale .6→1.06→1, rotate −6°→1°→0, 600–700 ms, cubic-bezier(.2,.9,.3,1.3). Usado em revelações.
- `pulse`: scale 1↔1.04, 2,4 s loop (secret card fechado).
- `shake`: translateX 0,−6,6,−4,4,0 em 400 ms (erros).
- `blink`: scaleY 1→.1→1 nos 8% finais de um ciclo de 4–5 s (olhos das ilustrações).
- `dots`: opacity .2↔1 escalonado .2 s (aguardando).
- Botão pressionado: scale .97 (.98 em cards).

---

## Componentes (Design System — `Jogae - Design System.dc.html`)

- **Button** 58 alto, raio 18, Barlow 22 caixa alta. Variantes: primary (roxo), action (amarelo/texto escuro), onColor (branco/texto escuro), secondary (`surface`), success, destructive, disabled (`surfaceLight` + texto muted, **o rótulo explica o motivo**: "Mínimo 3 jogadores"), loading (spinner 20 px + rótulo), hold (preenche amarelo da esquerda à direita conforme progresso).
- **Input** 56 alto, raio 16, `surface`, borda 2: `surfaceLight` default, `primaryLight` foco, `danger` erro; mensagem de erro 12–13 vermelha com ícone "!" e shake. Variante **código 4 dígitos**: 4 caixas 84 alto, raio 20, Barlow 44, caret lilás na próxima vazia.
- **Chip** pill, 11×15 padding, DM Sans 15/600: default (`surface` + borda `surfaceLight`), selecionado (roxo), filtro ativo (branco/texto escuro), bloqueado (texto `#52525B` + 🔒).
- **Stepper** −/+ círculos 48, número Barlow 40; pressionado fica roxo.
- **Segmented/Tabs** container `surface` raio 18 padding 6; item 44–48 raio 13; ativo roxo.
- **Avatar** círculo, inicial em Barlow 800, cor do jogador; tamanhos 34/40/44/64/72/110; badge online verde 14 com borda do fundo; vazio = tracejado.
- **Badge** pill 10/600 caixa alta: Host (roxo), Em alta (amarelo), categoria (`surfaceLight`), Novo (verde), Premium (borda lilás).
- **Bottom nav** 3 itens, ícone 24 stroke 2.2 + Barlow 12 caixa alta; ativo amarelo, inativo muted; fundo `background`, borda superior `surface`.
- **Game card** grande: fundo na cor do jogo, raio 28, padding 22, min 250 alto, ilustração absoluta no topo direito, badges, título Barlow 52/.95, descrição 15, meta 13, botão pill branco "Jogar agora". Médio: raio 24, min 196, título 24.
- **Player card** (lobby) raio 16 padding 12×14: avatar 40 + nome 16/600 + check verde 24 (ou badge Host / "Desconectou" em vermelho com opacity .6); vazio tracejado "Aguardando…".
- **Vote card** raio 24 padding 20×16, avatar 64, nome Barlow 22; selecionado: `surfaceLight`, borda 2 amarela, scale 1.03, check amarelo 26 no canto.
- **Ranking row** raio 20 padding 14×16: posição (🥇🥈🥉 / "4º" muted) 30 largura, avatar 44, nome 18/700, delta 12 (verde ou muted), pontos Barlow 26 + "pts" 14 muted. Líder tem fundo `surfaceLight`.
- **Secret card** 250×340 raio 28 roxo, moldura interna raio 18 borda 2 branca 25%, olho central 120, barra de progresso 8 no rodapé, "JOGAÊ" 14 letter-spacing 2 no topo; pulse contínuo; escala 1→1.06 conforme hold.
- **Timer** anel conic 96 (interno 78 `surface`), Barlow 30 tabular; cor roxo >20 s, amarelo ≤20 s, vermelho ≤10 s.
- **Progress** barras 6 raio pill: feitas roxo, atual amarelo, futuras `surfaceLight`.
- **Vote bar** 12 alto pill, `surfaceLight` fundo; mais votado amarelo, outros branco 60%; animar width 800 ms com delay 400 ms.
- **Toast** branco/texto escuro, raio 16, padding 12×14, ícone círculo 28 (verde ✓ / vermelho ! / roxo 🏆), fixo no topo (58 do topo), 2,2 s.
- **Modal** `surface` raio 28 padding 26×22 centralizado sobre scrim `rgba(15,15,19,.82)`; botões lado a lado 56.
- **Bottom sheet** `surface` raio 28 superior, handle 40×4 `surfaceLight`, scrim 60%.
- **Skeleton** blocos `surfaceLight` com shimmer opacity .5↔1 em 1,4 s.
- **Empty state** ícone em quadrado 56 raio 18 `surfaceLight`, título Barlow 22, apoio 13 muted, CTA pill roxo.
- **Error state** olhos olhando para baixo, título, apoio, botão "Tentar de novo".

### Logo
- Símbolo: quadrado arredondado roxo (raio 30% do lado), olho: elipse branca rx 14/ry 9 no centro (viewBox 40), pupila `#0F0F13` r 5.5 deslocada +3 à direita, brilho amarelo r 1.8 em (25,18). Sobre roxo: só o olho (rx 17/ry 11).
- Wordmark: "JOGAÊ" Barlow Condensed 800 caixa alta, letter-spacing −.3; o **Ê é amarelo** (roxo sobre fundo claro).
- Ícone do app: mesmo símbolo com raio ~22% (iOS aplica a máscara). Alternativas dark (`#0F0F13` com pupila roxa) e amarela (olho preto, pupila branca, brilho roxo). Monograma "Jê" para favicon/avatar.

### Ilustrações (SVG inline no HTML — portar para `react-native-svg`)
Olhos (Impostor; variante vermelha = perigo; olhando para baixo = erro), máscara (Desafio secreto), pill+seta (Quem é mais provável?), dado (sorteio), troféu (placar), bomba (Bomba-relógio). Formas chapadas, 2–3 cores, sem gradiente.

---

## Telas

Todas com padding 20 lateral, 64 topo, 24 rodapé, fundo `background` salvo indicação. "CTA" = Button primary 58 no rodapé (empurrado por `flex:1`).

### 1. Splash
Fundo roxo. Olho branco 150 (pop), pupila desloca 5 px à direita e volta a cada 2,4 s, pálpebra roxa fecha (scaleY 0→1→0) nos 12% finais do ciclo. Wordmark "JOGAÊ" 64 (in, delay .3 s), "Bora jogar?" 15 opacity .8 (delay .5 s), 3 pontos amarelos 8 pulsando a 56 do rodapé. Avança para Onboarding em 2,6 s ou ao tocar. Na produção: só mostra Onboarding no primeiro uso; depois vai direto para Home (ou Login se sem sessão).

### 2. Onboarding (3 passos)
Fundo muda por passo: roxo → amarelo → verde (transição 500 ms). Header: logo 22 + "Pular". Ilustração central (olhos 260 / dado 180 / troféu 180) com pop. Título Barlow 56/.9 + apoio 17/1.4 opacity .85 max 300 largura.
Passos: "Bora jogar?" / "Escolha um jogo, crie a sala e chame o grupo. O app conduz as regras — vocês só se divertem." · "Todos no mesmo lugar." / "Cada um entra pelo próprio celular com um código. Papéis secretos, votações e revelações, sem spoiler." · "Quem leva o troféu?" / "Pontos a cada rodada, placar ao vivo e um campeão no fim da noite."
Dots 6 alto: ativo 28 largura. Botão: branco em roxo; `#0F0F13` nos passos claros. Rótulo "Continuar" / último "Bora jogar" → Login.

### 3. Login / Cadastro
Header: logo + "Entrar como convidado" (→ Home). Segmented "Entrar | Criar conta". Título 44: "Bom te ver de novo." / "Crie sua conta em segundos.". Botões 56 raio 18: "Continuar com Google" (branco, ícone G) e "Continuar com Apple" (`surface` borda). Divisor "ou com e-mail". Campos: [Nome com avatar 40 amarelo mostrando inicial — só cadastro], E-mail, Senha (toggle "Mostrar/Ocultar" lilás). "Esqueci a senha" lilás alinhado à direita (só login). Validação no submit: nome ≥ 2, e-mail regex, senha ≥ 6 — erro em vermelho com shake; qualquer digitação limpa o erro. CTA disabled até todos os campos preenchidos; loading 900 ms → Home. Rodapé cadastro: "Ao criar conta você aceita os Termos e a Privacidade."

### 4. Esqueci a senha
Voltar. Título "Esqueceu a senha?" + "Sem drama. Mandamos um link para você criar uma nova." Input e-mail. CTA "Enviar link" (disabled se vazio). Erro: "Esse e-mail não parece válido." Estado enviado (pop): círculo verde 96 com ✓ Barlow 44, "LINK ENVIADO", "Confira {email}. O link vale por 30 minutos.", "Não chegou? Reenviar" (toast "Link reenviado"), CTA "Voltar para entrar".

### 5. Home (tab Jogar)
Saudação "Boa noite 👋" 16 muted (variar por hora: Bom dia / Boa tarde / Boa noite) + "BORA JOGAR?" 44; avatar 44 do usuário à direita (→ Perfil).
Game card hero **Impostor** roxo (badges "Dedução" translúcido e "Em alta" amarelo; "Todo mundo sabe a palavra. Menos um."; "3–12 jogadores · 10–20 min"; "Jogar agora") → Detalhes. Ilustração olhos com blink.
Grid 2 colunas: **Quem é mais provável?** (amarelo, "Polêmico", "Descubra o que seus amigos pensam.", "3+ jogadores") e **Desafio secreto** (verde, "Festa", "Complete sua missão sem ninguém perceber.", "3+ jogadores"), min 196 alto.
Card lista "Entrar em uma sala" (ícone QR amarelo, "Código de 4 dígitos ou QR Code do host.") → Entrar.
Card lista "Criar jogo com IA" (✨, "Descreva o grupo e a gente monta a brincadeira.", badge Premium roxo) → IA.
"ESCOLHA O CLIMA" 22 + chips: 😂 Engraçado · 🔥 Caótico · 👀 Polêmico · ❤️ Casais · 🎉 Festa · 👨‍👩‍👧 Família · ⚽ Futebol.
Bottom nav visível.

### 6. Explorar (tab)
Título "EXPLORAR" 40. Linha de chips horizontal (scroll, sangra 20 px): 🔥 Em alta (ativo branco) · 😂 Engraçados · 👀 Dedução · 🎉 Festa · ❤️ Casais · 👨‍👩‍👧 Família · ⚡ Rápidos. Grid 2 colunas de game cards raio 22 min 150: Impostor (roxo 👀 3–12 · 15 min), Quem é mais provável? (amarelo 👉 3+ · 10 min), Desafio secreto (verde 🕵️ 3+ · 20 min), Bomba-relógio (vermelho 💣 4+ · 15 min), Verdade ou mito (lilás ⚡ 2+ · 5 min), Casal perfeito (`surface` ❤️ 2–8 · 20 min). Categoria overline no topo, emoji 22 à direita, título Barlow 22, meta 12.

### 7. Detalhes do jogo
Header roxo min 330 com voltar (círculo translúcido), ilustração 260 centralizada e "IMPOSTOR" 60/.9 no rodapé do bloco. Corpo: descrição 17/1.45 "Todos recebem uma palavra secreta, menos o impostor. Dê pistas sem entregar demais e descubra quem está perdido." Chips info: 👥 3–12 jogadores · ⏱ 10–20 minutos · 🎯 Fácil de aprender. CTAs: "Criar partida" (primary) + "Como jogar" (secondary → bottom sheet com 3 passos numerados em círculos roxos 32 e botão "Entendi").

### 8. Criar partida
Voltar + "CRIAR PARTIDA" 32. Card `surface` raio 24: "Jogadores" + stepper (3–12, default 6). "Categoria" chips: 🍔 Comidas (default) · 🎬 Filmes · ⚽ Futebol · 🌎 Lugares · 🎲 Aleatório. "Rodadas" segmented 3 / 5 (default) / 10. Resumo 13 muted centralizado: "Impostor · Comidas · 5 rodadas · 6 jogadores". CTA "Criar sala" → Lobby. Meta: começar em < 30 s.

### 9. Lobby (host)
"SALA CRIADA 🎉" 32 + "Fechar". Card `surface` raio 28: overline "Código da sala", **4827** Barlow 72 amarelo letter-spacing 6, chips "Copiar" / "Compartilhar"; QR 96 em fundo branco raio 14 à direita. "{n} JOGADORES CONECTADOS" 20 + "de {total}" muted. Lista: Você (borda roxa, badge Host), jogadores entrando com animação `in` e check verde, slot tracejado "Aguardando…" com dots enquanto faltar gente. CTA "Começar partida" — disabled com rótulo "Mínimo 3 jogadores" até 3 conectados. Apoio "Só o host pode iniciar".

### 10. Entrar na sala (código / QR)
Voltar + "ENTRAR NA SALA". Segmented "Código | QR Code".
**Código**: "Peça o código de 4 dígitos ao host." 4 caixas; teclado numérico próprio 3×4 (raio 16, 56 alto, Barlow 26; ⌫ em `surfaceLight`; célula vazia à esquerda do 0); erro "Sala não encontrada. Confira o código com o host." com shake e bordas vermelhas, limpa o código; CTA "Digite o código" (disabled) → "Entrar na sala" → loading "Entrando" 900 ms → Lobby (convidado).
**QR**: quadro 260 `surface` raio 28 com cantos amarelos (borda 3, 34 px cada), linha de scan amarela com glow indo e voltando (1,2 s), rótulo "Câmera"; "Aponte para o QR Code na tela do host."

### 11. Lobby (convidado)
"VOCÊ ENTROU 🎉" + "Sair da sala". Card da sala: avatar do host 44, "Sala do André", "Impostor · Comidas · 5 rodadas", código 26 amarelo. Sem QR/copiar. Você com badge "Você" (`surfaceLight`). Rodapé: botão `surface` inerte com spinner "Aguardando o host começar". Ao host iniciar → Revelação.

### 12. Revelação do papel (secret card)
Overlines: "Rodada {n} · {categoria}" e "Só você vê isso". Título "SEU PAPEL ESTÁ PRONTO." 40. Secret card central com pulse. Botão hold 64 raio 20 branco: "Segure para revelar" → "Continue segurando…"; preenche amarelo em ~0,8 s (2,5%/20 ms); soltar antes zera. Haptic leve ao começar, forte ao completar.
Ao completar (pop 600 ms):
- **Palavra**: card branco raio 28 padding 36×24: overline "Sua palavra" `#71717A`, emoji 64, "PIZZA" Barlow 64, "Categoria: Comidas". Abaixo: "NÃO DEIXE O IMPOSTOR DESCOBRIR." 26.
- **Impostor**: fundo da tela `#1A0F14`; card `#0F0F13` borda 2 vermelha: olhos com íris vermelha 170, "VOCÊ É O IMPOSTOR" 48 vermelho. Abaixo: "DESCUBRA A PALAVRA SEM SER DESCOBERTO." 26.
CTA "Entendi, esconder" → Rodada. (Produção: também esconder ao perder foco do app.)

### 13. Rodada + Cronômetro
"RODADA {n}/{total}" 40 + chip categoria + botão pausa 40 (host e convidado). Card "Quem começa": dado amarelo 56 + "LUCAS" 34 (sorteado). Instrução 17: "Dê uma pista relacionada à palavra. Uma frase, sem repetir a dos outros." Card cronômetro: anel 96 + "1:00"; host: botões "Iniciar/Pausar" (roxo) e ↺; convidado: texto "O host controla o tempo. Quando todos derem pistas, a votação abre sozinha." Lista "Ordem": posição, avatar 34, nome, status "Agora" (amarelo) / "Próximo". CTA host: **amarelo** "Todos deram pistas → Votar"; convidado: `surface` com spinner "Aguardando o host abrir a votação".

### 14. Votação
"HORA DE VOTAR 👀" 40 + "Quem você acha que é o impostor?" 16 muted. Grid 2 col de vote cards (exclui você). CTA amarelo: "Escolha alguém" (disabled) → "Confirmar voto em {nome}" → tela **Aguardando votos**. Haptic ao selecionar.

### 15. Aguardando votos (tela cheia)
Overline "Rodada {n} · Votação" + "● Seu voto está guardado" verde. Anel conic amarelo 180 (interno `background`), "{votados}/{total}" Barlow 72 (denominador 28 muted). Título "AGUARDANDO VOTOS…" → "TODOS VOTARAM!" 40. Apoio "Ninguém vê os votos até todos confirmarem." Avatares 48 em linha: quem votou opacity 1 + check verde 18; pendentes opacity .4. Rodapé: "Faltam {k} — dá para trocar de ideia? Não. Voto é voto." → "Revelando o resultado…". Ao completar, 900 ms e → Resultado.

### 16. Resultado (3 tempos)
Fase 0 (0–1,6 s): "O GRUPO ESCOLHEU..." 44 centrado + 3 dots amarelos 14.
Fase 1 (1,6–3,3 s, pop): avatar 130 roxo com anel `rgba(124,58,237,.25)` 12 + "👀 LUCAS" 72.
Fase 2 (pop; fundo vira `resultWin`/`resultLose` em 600 ms): emoji 60 + "VOCÊS ACERTARAM!" / "O IMPOSTOR ESCAPOU" 52 + apoio "Lucas era o impostor. A palavra era PIZZA." / "Lucas era inocente. O impostor era Pedro." Card translúcido `rgba(15,15,19,.45)` "Votação" com vote bars (Lucas 4 votos, André 1 voto, Pedro 1 voto). Card "Pontos da rodada" + "+200 para o grupo" / "+300 para Pedro" amarelo 28. CTA branco "Ver placar". Haptic sucesso/erro.

### 17. Placar
Troféu 52 + "PLACAR" 40 + "Depois da rodada {n} de {total}". Ranking rows com stagger 70 ms: 🥇 André 1.250 (+250), 🥈 Carol 980 (+200), 🥉 Lucas 850 (+300), 4º Pedro 720 (+150), 5º João 610 (+0). CTA host "Próxima rodada" (→ Revelação, round+1) ou "Ver resultado final" na última; convidado: "O host inicia a próxima" com spinner.

### 18. Fim da partida
Fundo roxo. Overline "Fim da partida · Impostor · {n} rodadas". Troféu 120 + "ANDRÉ" 76/.9 + "venceu!" 32 amarelo + "1.250 pts · 2 impostores descobertos". Chips translúcidos "🥈 Carol 980" "🥉 Lucas 850". CTAs: "Jogar novamente" (branco → Lobby, round 1) e "Escolher outro jogo" (translúcido → Explorar).

### 19. Pausar / Sair (modal sobre a Rodada)
Ícone pausa em círculo 64. "PARTIDA PAUSADA" 34 + "O cronômetro parou para todos. Rodada {n} de {total}." Botão "Continuar" 56 roxo; abaixo "Regras" (→ bottom sheet) e "Sair da partida" (vermelho) lado a lado 50.
Confirmação: 👋 + host: "ENCERRAR PARA TODOS?" / "Você é o host: sair encerra a sala 4827 para os {n} jogadores." — convidado: "SAIR DA PARTIDA?" / "Os outros continuam sem você. Você perde os pontos desta rodada." Botões "Ficar" (`surfaceLight`) e "Sair" (vermelho) → Home + toast "Você saiu da partida".

### 20. Sem conexão / Reconectando (overlay)
Scrim 70%. Card: spinner anel 64 (borda 4 `surfaceLight`, topo amarelo) + "RECONECTANDO…" 32 + "Sua vaga e seus pontos estão guardados. A partida espera até {s}s." + barra amarela 6. Sucesso → fecha + toast "Conexão restabelecida". Falha (30 s): círculo vermelho "!" + "SEM CONEXÃO" + "Não conseguimos voltar para a sala 4827. Confira o Wi-Fi ou os dados móveis." + "Tentar de novo" (roxo) + link "Sair da partida".

### 21. Host saiu / Faltou gente
Olhos olhando para baixo 200 (pop). **Host saiu**: "O HOST SAIU DA SALA" 48 + "André encerrou a partida. Vocês podem continuar juntos em uma sala nova — o placar desta noite fica salvo." + avatares sobrepostos (−8) "4 ainda aqui" + CTA "Criar nova sala com eles" (→ Criar). **Faltou gente**: "FALTOU GENTE" + "O Impostor precisa de pelo menos 3 jogadores. Chame mais alguém ou escolha um jogo para 2." + "2 na sala" + CTA "Convidar mais amigos" (→ Amigos). Secundário "Voltar ao início".

### 22. Criação com IA (Premium)
Voltar. Overline lilás "✨ Premium" + "QUE TIPO DE JOGO VOCÊS QUEREM?" 40. Textarea `surface` raio 20 min 120, placeholder/exemplo "Somos 7 amigos em uma viagem e queremos algo engraçado para jogar durante uns 20 minutos." Chips extraídos (`surfaceLight`): 😂 engraçado · 👥 7 pessoas · ⏱ 20 min. Card sugestão roxo raio 24 (in): overline "Sugestão", "CAOS NA VIAGEM" 36, "7 jogadores · ~20 minutos", grid 3: 12 perguntas · 8 desafios · 3 especiais. CTA amarelo "Começar" → Criar partida. Sem premium: mostra paywall (tela 28).

### 23. Perfil (tab)
Avatar 72 (cor escolhida) + nome 30 + @username; ícones editar (lápis) e configurações (engrenagem) 40 `surface`. Grid 3 stats `surface` raio 18: 32 partidas (→ Histórico) · 8 vitórias (amarelo) · 14 amigos (→ Amigos). "CONQUISTAS" chips: 🕵️ Mestre do disfarce · 🔥 10 partidas · 👑 Rei do grupo (roxo). "PARTIDAS RECENTES" + "Ver todas" lilás; 3 linhas (ícone 38 na cor do jogo, nome, "Ontem · 5 jogadores", resultado "🥇 1º" amarelo / "3º" muted). Card upsell borda roxa "DESBLOQUEIE TUDO." + botão amarelo "Premium" → tela 28.

### 24. Editar perfil
Voltar + "EDITAR PERFIL". Avatar 110 com inicial; 6 swatches 36 (anel branco 3 no selecionado); apoio "Sua cor aparece no lobby, na votação e no placar." Campos Nome e @Username (só `a-z0-9_.`, minúsculo; status à direita: "mín. 3" / "em uso" vermelho, "disponível" verde). CTA "Salvar" → Perfil + toast "Perfil atualizado".

### 25. Configurações
Voltar + "CONFIGURAÇÕES". Grupo "Partida" (card `surface` raio 20, linhas com divisor `surfaceLight`): 🔊 Sons "Efeitos nas revelações e votações" · 📳 Vibração "Ao revelar o papel e no fim do tempo" · 💡 Tela sempre acesa "Durante a partida" · 🔔 Notificações "Quando um amigo cria uma sala" — toggles 50×30, knob 24 branco, on roxo / off `surfaceLight`. Grupo "Conta": 🌎 Idioma "Português (BR) ›" · ✨ Assinatura (badge "Grátis") → Premium · 🔒 Privacidade e termos · 💬 Ajuda e feedback. Rodapé: "Sair da conta" (`surface`, texto vermelho, 56) → Login; "Jogaê v1.0 · @username" `#52525B`.

### 26. Amigos
Voltar + "AMIGOS 14". Card roxo "CONVIDE A GALERA" + "Quem entrar pelo seu link vira amigo na hora." + botão branco "Copiar link" → "Copiado ✓" 2 s + toast "jogae.app/{username} copiado". Busca `surface` 50 "Buscar por nome ou @username". "Jogando agora": linhas com badge online verde, status verde "Impostor · sala 4827", botão roxo "Entrar" (→ Entrar na sala). "Todos": avatar, nome, "@handle · N partidas juntos", troféus à direita.

### 27. Histórico
Voltar + "HISTÓRICO". Stats 3: 32 partidas · 25% vitórias (amarelo) · 👀 favorito. Chips filtro horizontais: Todas (ativo) · Vitórias · Dedução · Festa · Polêmico · Caótico. Grupos por período ("Esta semana", "Semana passada", "Agosto") com linhas: ícone 44 raio 14 na cor do jogo, nome, "Ontem · 5 jogadores · Comidas", resultado + pontos à direita.

### 28. Premium (paywall)
✕ (→ Perfil) + badge "✨ Premium". Card roxo raio 28 min 250 com troféu 96 no topo direito, "DESBLOQUEIE TUDO." 56 + "Para o grupo inteiro — só um assina." Lista de perks (ícone em quadrado 40 `surface`, texto 16, check verde 22): ✨ Jogos criados com IA · 🎮 Todos os jogos · 🔥 Categorias exclusivas · ♾️ Partidas ilimitadas · 🎨 Criação de jogos personalizados. Planos 2 col raio 22 borda 2 (amarela no selecionado; anual default): Mensal "R$ 14,90 / por mês"; Anual "R$ 99 / R$ 8,25 / mês" com badge "−45%" amarelo flutuando. CTA amarelo "Começar 7 dias grátis · R$ 99/ano" (muda com o plano). Rodapé "7 dias grátis. Cancele quando quiser."

---

## Navegação
- Tabs (`Jogar | Explorar | Perfil`) só nas telas 5, 6, 23. Todo o resto é stack; o fluxo de partida (9, 11–21) é um stack modal em tela cheia com gesto de voltar **desabilitado** (sair só pelo botão de pausa).
- Splash → Onboarding (1ª vez) → Login → Home. Sessão ativa: Splash → Home.
- Deep link `jogae.app/j/4827` abre Entrar na sala com código preenchido.

## State (Zustand)
`session {user, isGuest}` · `profile {name, username, color}` · `settings {sound, vibe, keepAwake, notif}` · `room {code, hostId, players[], gameId, category, rounds, status, round}` · `me {role: 'word'|'impostor', word}` · `vote {target, confirmed}` · `result {chosenId, caught, tally[], pointsDelta}` · `scores[]` · `net {offline, reconnectSecs}` · `ui {paused, quitAsk, sheet, toast}`.

## Assets
Todos os gráficos são SVG inline nos `.dc.html` (logo, ilustrações, QR fake, ícones da nav 24px stroke). Emojis são conteúdo de texto (chips/conquistas). Nenhum bitmap.

## Files
- `Jogae - Prototipo.dc.html` — protótipo navegável com as 28 telas (lógica de simulação na classe JS no fim do arquivo; útil para timings e regras).
- `Jogae - Design System.dc.html` — logo, cores, tipografia, ilustrações, componentes e estados.
- `ios-frame.jsx`, `support.js` — apenas infra do protótipo; ignorar.

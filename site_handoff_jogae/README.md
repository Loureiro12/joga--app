# Handoff: jogae.app — site institucional + deep links

## Overview
Site do Jogaê com três papéis: (1) **vender o app** e trazer novos usuários, (2) **fazer os links do app funcionarem** (abrir a sala direto no app instalado; mostrar página de convite quando não estiver), (3) **servir as páginas públicas exigidas pelas lojas** (privacidade, termos, exclusão de conta).

## About the Design File
`Jogae - Site.dc.html` é uma **referência de design em HTML** — não é o código de produção. Abra no navegador e use a navegação do topo para ver as 6 páginas. A última ("Deep links") é nota técnica interna, **não é página pública**: não publicar.

Referências complementares: `Jogae - Design System.dc.html` (tokens e componentes do app) e `Jogae - Store Assets.dc.html` (ícone e texto das lojas).

## Fidelity
**Alta fidelidade.** Cores, tipografia, espaçamento, raios e cópia são finais. Recriar fielmente, adaptando o layout ao viewport (o design é fluido, não tem largura fixa).

## Stack sugerida
Next.js (App Router) ou Astro — o requisito real é **renderização estática/SSR** com HTML no servidor (SEO + preview de link no WhatsApp) e capacidade de servir arquivos estáticos em caminhos exatos sob `/.well-known/`. Hospedagem: Vercel, Netlify ou Cloudflare Pages. Sem CMS nesta fase; o conteúdo vive no código.

---

## Rotas

| Rota | Conteúdo | Observações |
|---|---|---|
| `/` | Landing de venda | Página principal, indexável |
| `/j/:codigo` | Convite de sala | `:codigo` = 4 dígitos; só renderiza se casar `^\d{4}$`, senão 404 |
| `/u/:username` | Convite de amizade | **ver decisão pendente abaixo** |
| `/privacidade` | Política de privacidade | URL enviada às duas lojas |
| `/termos` | Termos de uso | Linkada no cadastro e em Configurações do app |
| `/excluir-conta` | Exclusão de conta e dados | Exigida pelo Google Play (Data deletion) |
| `/.well-known/apple-app-site-association` | Arquivo iOS | Estático, `application/json`, **sem** extensão |
| `/.well-known/assetlinks.json` | Arquivo Android | Estático, `application/json` |

### Decisão pendente (confirmar com o produto antes de codar)
O app hoje copia `jogae.app/{username}` na tela Amigos, o que colide com as rotas fixas (um usuário `@termos` quebraria o site). Duas saídas:
- **Recomendada:** mudar para `/u/{username}` — sem ambiguidade. Exige ajustar o texto copiado na tela Amigos do app.
- Alternativa: manter na raiz com lista de palavras reservadas (`j`, `u`, `privacidade`, `termos`, `excluir-conta`, `api`, `well-known`, `assets`, `app`, `sobre`, `blog`, `suporte`) bloqueada também no cadastro de username.
O design foi escrito assumindo a primeira. Se mudar, ajustar a página "Convite" e o app juntos.

---

## Deep links — a parte crítica

O objetivo: o amigo toca em `https://jogae.app/j/4827` no WhatsApp e cai direto no lobby da sala. O mesmo vale para o QR Code do lobby lido pela câmera nativa.

### iOS — Universal Links
Arquivo em `https://jogae.app/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.app.jogae.ios",
        "paths": ["/j/*", "/u/*"]
      }
    ]
  }
}
```

Regras que costumam quebrar:
- `Content-Type: application/json`, **sem** a extensão `.json` no caminho.
- Sem redirect (nem `http→https`, nem `www→apex` nesse caminho específico), status 200 direto.
- HTTPS com certificado válido; o arquivo é buscado pela CDN da Apple e cacheado.
- No app: capability **Associated Domains** com `applinks:jogae.app`.
- Testar só em build assinada em aparelho real — o Simulator não valida.
- Servir o mesmo arquivo no apex e no `www` se ambos resolverem.

### Android — App Links
Arquivo em `https://jogae.app/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "app.jogae",
    "sha256_cert_fingerprints": ["<SHA-256 do certificado do Play App Signing>"]
  }
}]
```

- O fingerprint é o do **Play App Signing** (Play Console → Configuração → Integridade do app), não o de debug. Se houver upload key distinta, incluir os dois.
- No manifest: `intent-filter` com `android:autoVerify="true"` para `https://jogae.app`.
- Validar com o App Links Assistant / `adb shell pm verify-app-links`.

### Comportamento esperado
- **App instalado** → o sistema abre o Jogaê no lobby da sala; o site nem carrega.
- **App ausente** → carrega `/j/4827`, que guarda o código (ver abaixo) e oferece as lojas.
- **Depois de instalar** → o app recupera o código e entra na sala sozinho (*deferred deep link*). Implementação: Branch/AppsFlyer, ou solução simples via clipboard + `localStorage` e um endpoint de reivindicação. **Combinar a abordagem com o time do app** — o site precisa gravar o código no formato que o app espera.
- **WebViews de Instagram/Facebook** não disparam Universal Link: a página de convite tem de funcionar bem sozinha (é o caso mais comum de compartilhamento).
- `/j/:codigo` **não** deve tentar redirecionar via `jogae://` com timers — a heurística falha e mostra erro. Só a página com os botões das lojas.

---

## Design Tokens

### Cores
`primary #7C3AED` · `primaryLight #A78BFA` · `accent #FACC15` · `background #0F0F13` · `surface #19191F` · `surfaceLight #27272F` · `text #FAFAFA` · `muted #A1A1AA` · `mutedDark #52525B` · `success #22C55E` · `danger #EF4444`.
Texto sobre amarelo/verde/lilás = `#0F0F13`; sobre roxo/vermelho = `#FAFAFA`. Site inteiro em dark mode; sem gradiente, sem neon.

### Tipografia (Google Fonts, `display=swap`, preconnect)
- **Barlow Condensed** 600/700/800 — títulos, números, botões; sempre **caixa alta**.
  - H1 `clamp(56px, 7.5vw, 104px)` / line-height .9 / letter-spacing −1.5px
  - H2 de seção `clamp(34px, 4vw, 52px)` / 1
  - Título de card 24–28 / .95–1
  - Botão 20 / letter-spacing .4px
- **DM Sans** 400/500/600/700 — corpo.
  - Lead `clamp(17px, 2vw, 21px)` / 1.5 · Corpo 15–16 / 1.5–1.65 · Apoio 13–14 · Overline 11/600 letter-spacing .8 caixa alta · Mono (`ui-monospace, Menlo`) 12–13 só para caminhos de URL, em `#FACC15`.

### Layout
Container `max-width: 1180px`, padding lateral 24px. Espaço entre blocos da landing: 96px (reduzir para ~56px abaixo de 640px). Grades sempre `repeat(auto-fit, minmax(Xpx, 1fr))` com `gap: 12–14px` — sem breakpoints manuais. Todo filho de grid/flex que contém texto leva `min-width: 0`.

### Raios e sombras
Blocos grandes 32 · cards 24 · cards menores 18–20 · botões 16 · pills 99.
Sombra só no mockup do celular: `0 50px 100px rgba(0,0,0,.6)`.

### Animações
`jg-blink` (olho pisca: scaleY 1→.1→1 nos 8% finais de um ciclo de 5s) · `jg-float` (mockup sobe 14px, 6s, ease-in-out) · `jg-in` (opacity + translateY 14px, 500ms) no conteúdo do convite. Respeitar `prefers-reduced-motion: reduce` — desligar float e blink.

---

## Páginas

### `/` — Landing
1. **Header** (sticky opcional): logo (símbolo 34 + wordmark, "ê" amarelo), links de navegação em pills, botão "Baixar" roxo.
2. **Hero** em 2 colunas (`minmax(320px,1fr)`): badges ("3–12 jogadores", "Grátis para começar" amarelo); H1 "Todo mundo sabe a palavra. / **Menos um.**" (segunda linha amarela); lead; botões App Store (branco) e Google Play (branco, logo colorido); nota "Sem cadastro obrigatório — dá para entrar como convidado." À direita, mockup de celular 300×640 com a Home do app e o olho piscando.
3. **"Em menos de 30 segundos"** — 3 cards numerados (roxo/amarelo/verde): Escolha o jogo · Crie a sala · Joguem.
4. **"Os jogos"** — 6 cards coloridos (Impostor roxo, Quem é mais provável? amarelo, Desafio secreto verde, Bomba-relógio vermelho, Verdade ou mito lilás, Casal perfeito surface), cada um com categoria, emoji, nome, frase e meta.
5. **Premium** — bloco roxo raio 32 em 2 colunas: à esquerda título e chips de benefícios; à direita os dois planos (mensal R$ 14,90 / anual R$ 99 destacado em amarelo) e CTA "Começar 7 dias grátis".
6. **FAQ** — 5 itens acordeão (um aberto por vez; `<details>`/`<summary>` nativo é aceitável e melhor para SEO).
7. **CTA final** — bloco `surface` centralizado com o olho, "Bora jogar?" e os dois botões.
8. **Footer** — logo pequeno, copyright, links para as páginas legais.

### `/j/:codigo` — Convite de sala
Nota no topo em `mutedDark` explicando o contexto **não vai para produção** (é anotação do design). Conteúdo real: avatar + "André te convidou" / "Impostor · 5 jogadores já entraram"; H1 "Você foi convidado para a sala"; card com o código em Barlow 84 amarelo letter-spacing 8 e avatares sobrepostos (−10px) de quem está na sala; texto "Instale o Jogaê e o código entra sozinho."; botões das lojas; link "Já tenho o app — abrir o Jogaê →" (dispara o esquema `jogae://`). À direita, mockup do lobby. Abaixo, bloco explicando os três tipos de link.

**Dados dinâmicos:** nome do host, jogo, número de jogadores e avatares vêm de um endpoint público somente-leitura (`GET /api/room/:codigo` → `{host, game, players:[{initial,color}], count}`), sem dado sensível. Se a sala não existir ou já tiver terminado, mostrar a mesma página com o código esmaecido e o texto "Essa sala já terminou" + botões das lojas (nunca um 404 seco — o objetivo é converter).

**Persistência para deferred link:** gravar o código em `localStorage` e no clipboard (com o combinado do time do app) antes de mandar para a loja.

### `/privacidade`
Coluna única `max-width: 760px`. Cabeçalho + data de atualização, 9 seções (`Quem somos`, `Dados que coletamos`, `O que não coletamos`, `Para que usamos`, `Com quem compartilhamos`, `Por quanto tempo guardamos`, `Seus direitos`, `Crianças`, `Mudanças`) e card de contato com link para `/excluir-conta`. Texto integral no arquivo de design — copiar literalmente. **Revisão jurídica obrigatória antes de publicar.**

### `/termos`
Mesma estrutura, 8 seções. Texto integral no design.

### `/excluir-conta`
H1 + lead; dois cards lado a lado (1. No app / 2. Por e-mail `excluir@jogae.app`); card "O que acontece com seus dados" com 5 linhas (apagados na hora / em até 30 dias / anonimizados / mantidos por lei / fora do nosso alcance), cada uma com ícone circular colorido; aviso final com borda vermelha sobre irreversibilidade e cancelamento da assinatura na loja. Esta página precisa ser **acessível sem login e sem o app**.

---

## SEO e compartilhamento
- `<title>` e `<meta description>` por página; `lang="pt-BR"`.
- **Open Graph obrigatório em `/j/:codigo`** — é o que aparece no WhatsApp: `og:title` "Você foi convidado para a sala 4827", `og:description` "André te chamou para jogar Impostor no Jogaê", `og:image` 1200×630 (pode ser gerada dinamicamente com o código da sala). Sem isso o convite vira um link cinza.
- `og:image` padrão para as demais páginas (reaproveitar arte dos store assets).
- `robots.txt`: permitir tudo menos `/j/` e `/u/` (páginas efêmeras/pessoais); `sitemap.xml` com `/`, `/privacidade`, `/termos`, `/excluir-conta`.
- JSON-LD `SoftwareApplication` na home.

## Acessibilidade
- Contraste mínimo 4.5:1 — atenção aos textos `#A1A1AA` sobre `#19191F` (ok) e às opacidades sobre roxo: usar `rgba(250,250,250,.85)` no mínimo, nunca abaixo.
- Navegação por teclado no menu, FAQ e botões; foco visível (anel `#A78BFA` 2px).
- Todo SVG decorativo com `aria-hidden="true"`; botões de loja com `aria-label` completo.
- Respeitar `prefers-reduced-motion`.
- Semântica real: `<header> <main> <section> <h1..h3> <footer>`, links como `<a href>` (no design são `div` por limitação do protótipo).

## Performance
- Fontes: `preconnect` + `display=swap`, só os pesos listados.
- Zero imagem bitmap — logo, ilustrações e badges de loja são SVG inline (badges oficiais das lojas: baixar os arquivos oficiais da Apple e do Google, que têm regras de uso próprias; os do design são aproximações).
- Meta de Lighthouse: ≥ 95 em Performance e Acessibilidade.

## Analytics (privacidade-first)
Plausible ou Umami (sem cookies, sem banner de consentimento). Eventos: `download_click` (com `store` e `page`), `invite_view` (com `has_app` desconhecido), `faq_open`, `premium_cta`.

## Pendências para o produto
1. Decidir `/u/{username}` vs. raiz com reservadas (afeta o app).
2. Definir o mecanismo de deferred deep link junto com o time do app.
3. Revisão jurídica de privacidade e termos; confirmar razão social, CNPJ, foro e e-mails.
4. Confirmar App ID (TeamID + bundle) e package name + SHA-256 para os arquivos `.well-known`.
5. URLs reais das lojas para os botões.

## Files
- `Jogae - Site.dc.html` — design das 6 páginas (a última é nota técnica, não publicar).
- `Jogae - Design System.dc.html` — tokens, logo e componentes.
- `Jogae - Store Assets.dc.html` — ícone e texto das fichas das lojas.
- `support.js` — infra do protótipo; ignorar.

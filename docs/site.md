# Publicar o site (jogaeapp.com.br)

O site vive em [`apps/site`](../apps/site). Dá para publicar **antes de ter o domínio**: a Vercel entrega um endereço provisório (`algo.vercel.app`) e tudo funciona nele, menos abrir o app direto pelo link — isso a Apple e o Google só liberam para o domínio definitivo.

## 1. Publicar na Vercel (sem domínio)

1. Entre em vercel.com com o GitHub e clique em **Add New → Project**.
2. Escolha o repositório `joga--app`.
3. Em **Root Directory**, selecione `apps/site`. O framework (Astro) é detectado sozinho; não mude os comandos.
4. Em **Environment Variables**, adicione por enquanto só:
   - `ROOM_API_URL` = `https://jogae.fly.dev`
5. **Deploy**.

A cada `git push` na `main` a Vercel publica de novo; cada Pull Request ganha um endereço de prévia.

Confira no endereço provisório:

- `/` abre a landing, com os botões de loja em "Em breve";
- `/privacidade`, `/termos` e `/excluir-conta` abrem;
- `/.well-known/apple-app-site-association` responde JSON (vazio por enquanto);
- crie uma sala no app e abra `/j/<código>`: deve aparecer o nome de quem criou.

Para o app usar esse endereço nos links de convite e nas páginas legais, ponha em `apps/mobile/.env.local`:

```
EXPO_PUBLIC_SITE_URL=https://SEU-PROJETO.vercel.app
```

e reinicie com `npx expo start --clear`.

## 2. Quando o domínio existir

1. Vercel → projeto → **Settings → Domains** → adicione `jogaeapp.com.br` e `www.jogaeapp.com.br`. **O principal é o sem `www`** (Production); o `www` redireciona para ele. A Vercel sugere o contrário — inverta: a Apple e o Google buscam o `.well-known` no domínio exato declarado no app e não seguem redirecionamento.
   - No Registro.br: **Configurar endereçamento → Modo avançado** e crie o `A` (nome vazio) e o `CNAME` (`www`) que a Vercel mostra. Não mexa em "Alterar servidores DNS". A zona leva de 30 min a 2 h para publicar; confira com `dig +short A jogaeapp.com.br @a.auto.dns.br`.
2. Variável `SITE_URL` = `https://jogaeapp.com.br` (é o que vai no `canonical`, no `og:url` e no sitemap) e **Redeploy**.
3. Tire `EXPO_PUBLIC_SITE_URL` do app (o padrão já é `https://jogaeapp.com.br`).
4. Crie as caixas de e-mail citadas nas páginas: `privacidade@`, `dpo@`, `excluir@` e `contato@jogaeapp.com.br`.

## 3. Fazer o link abrir o app

Precisa do domínio definitivo e de dois identificadores:

| Variável na Vercel | De onde vem |
|---|---|
| `APPLE_TEAM_ID` | developer.apple.com → Membership → Team ID (10 caracteres) |
| `ANDROID_SHA256_FINGERPRINTS` | Play Console → Configuração → Integridade do app → certificado de **assinatura do app** (não o de upload nem o de debug). Vários: separados por vírgula |

Depois de um redeploy, confira:

```bash
curl -i https://jogaeapp.com.br/.well-known/apple-app-site-association
curl -i https://jogaeapp.com.br/.well-known/assetlinks.json
```

Os dois têm de responder `200`, `content-type: application/json`, **sem redirecionamento**. O app já declara `applinks:jogaeapp.com.br` (iOS) e o `intent-filter` com `autoVerify` (Android) no `app.json`; é preciso um **build novo pelo EAS** para isso valer. O teste no iOS só funciona em build assinado num aparelho real — o Simulator não valida o arquivo.

> O identificador do app é `app.jogae` nas duas plataformas. O handoff do site citava `app.jogae.ios`; o que vale é o do `app.json`.

## 4. Quando o app estiver nas lojas

`PUBLIC_APP_STORE_URL` e `PUBLIC_PLAY_STORE_URL` com os links das fichas. Os botões deixam de dizer "Em breve". Troque também os botões desenhados pelos **selos oficiais** da Apple e do Google, que têm regras de uso próprias.

## 5. Analytics (opcional)

`PUBLIC_PLAUSIBLE_DOMAIN` = `jogaeapp.com.br` liga o Plausible (sem cookies, sem banner). Eventos já instrumentados: `download_click`, `invite_view`, `faq_open`, `premium_cta`. Sem a variável, o site não carrega nenhum script de terceiros.

## Pendências antes de divulgar

- **Revisão jurídica** de `/privacidade`, `/termos` e `/excluir-conta`. O texto veio do handoff, com dois ajustes onde ele descrevia algo que o app não faz (estão comentados em `apps/site/src/data/legal.ts`). Confirmar razão social ("Jogaê Tecnologia Ltda."), CNPJ, foro e a idade mínima de 12 anos.
- Os e-mails `@jogaeapp.com.br` precisam existir: `/excluir-conta` promete resposta em 7 dias.
- O cinza dos textos de apoio foi clareado em relação ao handoff (`#52525B` → `#8B8B95`) para cumprir o contraste mínimo de 4,5:1 que o próprio handoff exige.

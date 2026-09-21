# jogae-site

O site `jogae.app`: landing, páginas de convite (que fazem os links do app funcionarem), páginas legais exigidas pelas lojas e os arquivos `.well-known`. Astro 5, zero JavaScript de framework no navegador.

```bash
npm install
npm run dev        # http://localhost:4321
npm run check      # tipos + build + teste de fumaça contra uma API de salas falsa
npm run preview    # roda o build de produção (node dist/server/entry.mjs)
npm run og         # regenera public/og/*.png a partir de scripts/og/*.html (precisa do Chrome)
```

Da raiz do monorepo: `npm run site`, `npm run site:build`, `npm run site:check`.

## Por que este pacote fica FORA dos workspaces

Ele tem `package-lock.json` próprio e não aparece em `workspaces` no `package.json` da raiz, de propósito:

- o Dockerfile do servidor de salas valida o lockfile da raiz contra **todos** os workspaces — um workspace novo quebraria o `fly deploy`;
- as ~450 dependências do Astro não mexem nas versões fixadas do app (Expo é sensível a isso);
- a Vercel constrói só esta pasta, sem instalar o Expo.

O site não importa nada do monorepo. O que ele precisa saber do app (bundle id, esquema `jogae://`, formato do username) está em `src/lib/config.ts` e é conferido pelo teste de fumaça.

## Rotas

| Rota | Tipo | Observação |
|---|---|---|
| `/` `/privacidade` `/termos` `/excluir-conta` | estática | entram no `sitemap.xml` |
| `/j/:codigo` | servidor | 4 dígitos, senão 404. Consulta `ROOM_API_URL/api/room/:codigo` com prazo de 2,5 s |
| `/u/:username` | servidor | mesma regra de username do banco |
| `/.well-known/apple-app-site-association` | servidor | sem extensão → precisa ser rota para sair como `application/json` |
| `/.well-known/assetlinks.json` | servidor | |
| `/robots.txt` `/sitemap.xml` | estática | convites ficam fora dos buscadores |

A página de convite tem três estados, e a diferença importa: **sala encontrada** (host, jogo e avatares reais), **sala encerrada** (o servidor respondeu 404 — "Essa sala já terminou", nunca um 404 seco) e **servidor não respondeu** (convite genérico; não afirmamos que a sala acabou).

## Deferred deep link

Sem SDK de terceiros. Ao tocar num botão de loja, a página copia **só os 4 dígitos** para a área de transferência (e avisa na tela); no app, "Entrar em uma sala" tem o botão **Colar código**. O convite também fica em `localStorage` (`jogae:invite`), para uso futuro.

## Variáveis de ambiente

Todas opcionais — ver [.env.example](.env.example). Sem `PUBLIC_*_STORE_URL` os botões viram "Em breve"; sem `APPLE_TEAM_ID` / `ANDROID_SHA256_FINGERPRINTS` os `.well-known` saem válidos porém vazios.

Publicação: [docs/site.md](../../docs/site.md).

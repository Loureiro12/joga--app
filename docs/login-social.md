# Login com Google e Apple

O código já está pronto; falta configuração em três painéis (Google Cloud, Apple Developer, Supabase) e um build nativo.

| | iOS | Android |
|---|---|---|
| Google | navegador do sistema → Supabase (OAuth + PKCE) | idem |
| Apple | **nativo** (folha da Apple, `signInWithIdToken`) | navegador → Supabase (opcional, ver §3) |

Convidado que entra com Google/Apple **mantém o mesmo usuário** (`linkIdentity`); se aquela conta Google/Apple já for de outro usuário, o app entra na conta antiga. Isso exige *Manual linking* ligado no Supabase (Authentication → Sign In / Providers → seção de cima).

Projeto de dev: `onkskphqcwigrghanblc`. Callback do Supabase: `https://onkskphqcwigrghanblc.supabase.co/auth/v1/callback`. Em produção, repita tudo com o ref do projeto de produção.

## 1. Google

1. https://console.cloud.google.com → crie o projeto **Jogaê**.
2. **Google Auth Platform → Branding** (antiga "tela de consentimento OAuth"): nome `Jogaê`, e-mail de suporte, tipo **Externo**. Domínios autorizados: `jogaeapp.com.br` e `supabase.co`. Links: `https://jogaeapp.com.br`, `/privacidade`, `/termos`.
3. **Data access**: só os escopos padrão (`openid`, `email`, `profile`). Com eles o Google não exige a verificação demorada.
4. **Audience → Publish app**. Em "Testing", só os e-mails da lista de testadores conseguem entrar (os outros veem "acesso bloqueado").
5. **Clients → Create client → Web application** (é Web mesmo: quem fala com o Google é o Supabase, não o app). Em *Authorized redirect URIs*, o callback do Supabase acima. Guarde o **Client ID** e o **Client secret**.
6. Supabase → **Authentication → Sign In / Providers → Google** → ligue, cole Client ID e secret, salve.

A tela do Google vai dizer "continuar para onkskphqcwigrghanblc.supabase.co". É cosmético; trocar exige o *custom domain* pago do Supabase.

## 2. Apple no iOS

1. https://developer.apple.com/account → **Certificates, IDs & Profiles → Identifiers → `app.jogae`** → confira **Sign in with Apple** marcado. (O EAS liga sozinho no build, porque o `app.json` tem `usesAppleSignIn`; se o identificador ainda não existe, ele nasce no primeiro `eas build`.)
2. Supabase → **Providers → Apple** → ligue. Em **Client IDs**: `app.jogae`. *Secret Key* fica vazio — no fluxo nativo não há segredo.
   - Para testar no **Expo Go** (só no projeto de dev): acrescente `host.exp.Exponent` aos Client IDs, separado por vírgula. No Expo Go o token da Apple sai em nome do Expo Go, não do Jogaê.
3. Build de iOS (o entitlement vai dentro do binário): `cd apps/mobile && eas build --platform ios --profile preview` (aparelhos cadastrados com `eas device:create`) ou `--profile production` + TestFlight.

## 3. Apple no Android (opcional)

A App Store só exige "Entrar com Apple" no iOS. No Android o botão usa o fluxo web, que pede um **Services ID**, uma **chave .p8** e um segredo (JWT) que **expira a cada 6 meses** — se vencer, o login quebra. Recomendação: esconder o botão no Android até haver demanda.

Se for configurar: Identifiers → **Services IDs** → `app.jogae.web`, Sign in with Apple → domínio `onkskphqcwigrghanblc.supabase.co`, return URL = callback do Supabase; **Keys** → nova chave com Sign in with Apple → baixe o `.p8`; gere o segredo com a ferramenta da página do provedor no Supabase; em Client IDs: `app.jogae,app.jogae.web`.

## 4. Redirect URLs (Supabase → Authentication → URL Configuration)

- `jogae://**` — builds (já cadastrado no passo 2 do backend).
- `https://jogaeapp.com.br/**`.
- `exp://**` — **só no projeto de dev**, para o Google funcionar no Expo Go. Sem isso o Supabase ignora o retorno e manda para o *Site URL*.

## 5. Builds do EAS enxergam o Supabase?

`cd apps/mobile && eas env:list --environment preview` tem de listar `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` e `EXPO_PUBLIC_ROOM_SERVER_URL`. Sem elas o build sai em modo simulado e os botões "funcionam" de mentira. Rode os comandos `eas` **de dentro de `apps/mobile`** (na raiz ele cria um `app.json` solto).

## 6. Roteiro de teste

1. Google, conta nova → cai na Home com o nome do Google; Supabase → Authentication → Users mostra o provedor `google`.
2. Sair → entrar de novo com Google → mesmo usuário.
3. **Convidado → Google**: entre como convidado, jogue uma partida, depois Perfil → criar conta → Google. O id do usuário não muda e o histórico continua.
4. **Convidado → Google que já tem conta**: o navegador abre duas vezes (tenta vincular, depois entra) e cai na conta antiga.
5. Apple no iPhone: folha nativa, nome preenchido no primeiro login. Com "Ocultar meu e-mail", o e-mail vem `@privaterelay.appleid.com` — normal.
6. Cancelar a janela em qualquer um → volta para o login sem erro.

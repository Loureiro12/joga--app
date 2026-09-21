# Publicar o servidor de salas no Fly.io

O que vai para o Fly é só o `apps/room-server`: um processo Node com WebSocket. Banco e login continuam no Supabase; o app continua sendo distribuído pelo EAS.

Arquivos envolvidos: [`fly.toml`](../fly.toml) (raiz), [`apps/room-server/Dockerfile`](../apps/room-server/Dockerfile) e [`.dockerignore`](../.dockerignore). O build acontece nos servidores do Fly — você **não** precisa de Docker na sua máquina.

## Primeira vez

```bash
brew install flyctl
fly auth signup            # ou: fly auth login
```

O Fly pede um cartão no cadastro.

Na raiz do repositório:

```bash
fly launch --no-deploy --copy-config --name SEU-NOME-DE-APP --region gru
```

- `--copy-config` usa o `fly.toml` que já está no repositório em vez de gerar outro.
- O nome é único no Fly inteiro e vira o endereço `SEU-NOME-DE-APP.fly.dev`. Se o `fly launch` alterar o campo `app` do `fly.toml`, commite a mudança.
- Se ele perguntar se quer ajustar a configuração ("tweak these settings"), responda **não**. Se oferecer Postgres, Redis ou Sentry, recuse.

As duas variáveis do Supabase (as mesmas de `apps/mobile/.env.local`; a chave é a **pública**):

```bash
fly secrets set SUPABASE_URL=https://SEU_ID.supabase.co SUPABASE_ANON_KEY=sb_publishable_xxx
```

Publicar e garantir **uma** máquina:

```bash
fly deploy
fly scale count 1
```

> **Nunca rode com 2 máquinas.** As salas vivem na memória de um processo: com duas, o host cairia numa e os convidados na outra, e "sala não encontrada" apareceria ao acaso. O disco (`[mounts]`) também é por máquina.

## Conferir

```bash
curl https://SEU-NOME-DE-APP.fly.dev/healthz
fly logs
```

O `healthz` deve responder `"status":"ok","env":"production"`. Nos logs, a primeira linha do servidor mostra `auth=supabase` e `salas gravadas em /data/rooms`.

## Apontar o app

Em `apps/mobile/.env.local`:

```
EXPO_PUBLIC_ROOM_SERVER_URL=wss://SEU-NOME-DE-APP.fly.dev/ws
```

`wss://` (com **s**), sem porta. Depois `npx expo start --clear` — sem o `--clear` o Metro continua com o endereço antigo embutido.

Para os builds do EAS, a mesma variável precisa existir no ambiente do build (`eas env:create` ou o bloco `env` do perfil em `eas.json`), senão o build sai em modo simulado.

## Dia a dia

| Quero… | Comando |
|---|---|
| Publicar uma versão nova | `fly deploy` |
| Ver o que está acontecendo | `fly logs` |
| Estado das máquinas | `fly status` |
| Entrar na máquina | `fly ssh console` (as salas estão em `/data/rooms/*.json`) |
| Trocar uma variável | `fly secrets set NOME=valor` (reinicia sozinho) |

Um deploy reinicia o processo: o servidor grava as salas ao receber o `SIGTERM`, a máquina nova as lê do disco, e os celulares reconectam sozinhos por trás da tela "Reconectando…". Foi testado localmente derrubando o processo no meio de uma rodada.

## Decisões embutidas no `fly.toml`

- **Desliga quando ninguém está conectado** (`auto_stop_machines = "stop"`, `min_machines_running = 0`). Custa quase nada enquanto você testa. O preço é 1–3 s a mais na primeira conexão depois de um período parado. Para lançamento, troque para `"off"` e `min_machines_running = 1`.
- **`AUTH_MODE=supabase`**: em produção o servidor se recusa a subir com tokens de dev, então **os bots (`npm run bots`) não funcionam contra o Fly**. Para testar sozinho com bots, use o servidor local.
- **256 MB / shared-cpu-1x**: uma partida gera poucas dezenas de mensagens. Aumente só se o `fly logs` mostrar falta de memória.

## Não verificado

O Dockerfile não foi construído nesta máquina (o Docker local não baixa imagens). O que foi verificado: os passos dele reproduzidos numa pasta limpa (`npm ci` só dos workspaces do servidor + build, gerando um bundle idêntico ao local) e o bundle rodando sozinho em `NODE_ENV=production` com um token real do Supabase. Se o primeiro `fly deploy` falhar no build, o erro aparece no próprio terminal.

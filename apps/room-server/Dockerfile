# Servidor de salas do Jogaê. O contexto de build é a RAIZ do repositório (monorepo):
#   fly deploy            (o fly.toml da raiz aponta para este arquivo)
#   docker build -f apps/room-server/Dockerfile .

# ---- build: instala só os workspaces do servidor e gera um único arquivo JS ----
FROM node:20-alpine AS build
WORKDIR /repo

# O npm valida o lockfile contra TODOS os workspaces, então os package.json de todos entram;
# mas só as dependências do servidor e do engine são instaladas (13 pacotes, sem Expo).
COPY package.json package-lock.json ./
COPY apps/mobile/package.json apps/mobile/
COPY apps/room-server/package.json apps/room-server/
COPY packages/engine/package.json packages/engine/
COPY packages/db/package.json packages/db/
RUN npm ci --ignore-scripts --no-audit --no-fund -w @jogae/room-server -w @jogae/engine

COPY packages/engine/src packages/engine/src
COPY apps/room-server/src apps/room-server/src
RUN npm run build -w @jogae/room-server

# ---- runtime: só o Node e o bundle (o `ws` e o engine já estão dentro dele) ----
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/room-server/dist/server.cjs /repo/apps/room-server/dist/server.cjs.map ./

# Roda como root de propósito: o volume do Fly é montado em /data como root EM TEMPO DE EXECUÇÃO
# (um chown na imagem não vale para ele), e o servidor precisa criar /data/rooms.
# No Fly cada app é uma microVM isolada, então root aqui não é root de um host compartilhado.

EXPOSE 8080
CMD ["node", "--enable-source-maps", "server.cjs"]

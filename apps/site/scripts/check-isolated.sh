#!/bin/bash
# Roda `npm run check` numa cópia do site FORA do repositório — o mesmo ambiente do CI e da Vercel.
#
# Por que existe: dentro do monorepo, o Node e o TypeScript sobem as pastas e acham pacotes no
# node_modules da raiz. Uma dependência que falta no package.json do site passa despercebida aqui
# e só quebra no CI (foi o que aconteceu com @types/node).       npm run check:isolated
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
rsync -a --exclude node_modules --exclude dist --exclude .astro --exclude .vercel ./ "$TMP/"
cd "$TMP"
npm ci --no-audit --no-fund >/dev/null
npm run check

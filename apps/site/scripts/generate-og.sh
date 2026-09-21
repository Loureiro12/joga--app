#!/bin/bash
# Gera public/og/*.png (1200×630) a partir de scripts/og/*.html com o Chrome headless.
# Rode quando mudar a arte: npm run og   (precisa de internet para as fontes do Google)
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
mkdir -p public/og
for html in scripts/og/*.html; do
  name=$(basename "$html" .html)
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1200,630 --virtual-time-budget=4000 \
    --screenshot="$PWD/public/og/$name.png" "file://$PWD/$html" >/dev/null 2>&1
  echo "public/og/$name.png"
done

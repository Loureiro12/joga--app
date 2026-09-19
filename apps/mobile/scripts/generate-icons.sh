#!/bin/bash
# Gera os PNGs de assets/ a partir dos SVGs em assets/source/ (Chrome headless).
# Uso: npm run icons
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
TMP=$(mktemp -d)
for svg in assets/source/*.svg; do
  name=$(basename "$svg" .svg)
  size=$(grep -o 'width="[0-9]*"' "$svg" | head -1 | tr -dc '0-9')
  echo "<html><body style='margin:0;background:transparent'><img src='file://$PWD/$svg' width='$size' height='$size' style='display:block'></body></html>" > "$TMP/$name.html"
  # O ícone do iOS não pode ter canal alfa (a App Store rejeita): fundo opaco só para ele.
  bg=00000000; [ "$name" = icon ] && bg=7C3AEDFF
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=$bg \
    --force-device-scale-factor=1 --window-size="$size,$size" \
    --screenshot="$PWD/assets/$name.png" "file://$TMP/$name.html" >/dev/null 2>&1
  echo "assets/$name.png (${size}px)"
done
rm -rf "$TMP"

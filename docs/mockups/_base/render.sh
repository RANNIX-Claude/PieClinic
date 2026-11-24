#!/bin/bash
# Uso: render_full.sh archivo.html → PNG de altura completa (mide scrollHeight con --dump-dom y vuelve a capturar)
C="/c/Program Files/Google/Chrome/Application/chrome.exe"
for f in "$@"; do
 out="${f%.html}.png"; url="file:///$(cygpath -m "$PWD/$f")"
 h=$(timeout 40 "$C" --headless=new --disable-gpu --window-size=1440,1000 --dump-dom "$url" 2>/dev/null | grep -o 'data-h="[0-9]*"' | head -1 | grep -o '[0-9]*')
 h=${h:-1000}; [ "$h" -lt 900 ] && h=900
  timeout 40 "$C" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,$((h+2)) --screenshot="$(cygpath -w "$PWD/$out")" "$url" >/dev/null 2>&1
 echo "$out ${h}px"
done

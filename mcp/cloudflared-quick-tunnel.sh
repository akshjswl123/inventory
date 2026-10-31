#!/bin/sh
# Quick tunnel: mirror cloudflared logs to stdout and persist the public URL to a file.
# Usage: cloudflared-quick-tunnel.sh <upstream-url> <output-file>
set -eu

UPSTREAM="${1:?upstream url required}"
OUT_FILE="${2:?output file required}"
mkdir -p "$(dirname "$OUT_FILE")"

write_url() {
  url="$1"
  [ -n "$url" ] || return 0
  printf '%s\n' "$url" >"$OUT_FILE"
}

cloudflared tunnel --no-autoupdate --url "$UPSTREAM" 2>&1 | while IFS= read -r line; do
  printf '%s\n' "$line"
  case "$line" in
    *trycloudflare.com*)
      url=$(printf '%s' "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare.com' | head -1)
      write_url "$url"
      ;;
  esac
done

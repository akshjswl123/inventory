#!/usr/bin/env bash
# Verify MCP before using Cursor (stdio needs Docker; HTTP needs tunnel).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== postgres-mcp container =="
docker ps --filter name=postgres-mcp --format '  {{.Names}} {{.Status}}' || true

echo "== poc_db on host :5433 =="
docker ps --filter name=poc_db --format '  {{.Names}} {{.Status}}' || true

echo "== HTTP local (127.0.0.1:5000/mcp) =="
if curl -sS -m 10 -X POST "http://127.0.0.1:5000/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"verify","version":"1"}}}' \
  | head -c 80 | grep -q 'event: message'; then
  echo "  OK initialize"
else
  echo "  FAIL (is postgres-mcp up? docker compose up -d postgres-mcp)"
fi

if [[ -f mcp/runtime/mcp-tunnel.url ]]; then
  echo "== HTTP Cloudflare =="
  BASE="$(tr -d '\r\n' < mcp/runtime/mcp-tunnel.url)/mcp"
  if curl -sS -m 15 -X POST "$BASE" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"verify","version":"1"}}}' \
    | head -c 80 | grep -q 'event: message'; then
    echo "  OK $BASE"
  else
    echo "  FAIL $BASE — run: docker compose restart tunnel-mcp && ./scripts/show-tunnel-urls.sh"
  fi
fi

echo "== Client JSON (run on this server, paste on other machine) =="
if [[ -x "$ROOT/scripts/print-mcp-client-json.sh" ]]; then
  "$ROOT/scripts/print-mcp-client-json.sh" | head -6
fi
echo "  Client: url only → server host (LAN or Cloudflare). Not host.docker.internal."

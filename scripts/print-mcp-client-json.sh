#!/usr/bin/env bash
# Run on the machine that hosts docker compose (db + postgres-mcp + tunnel-mcp).
# Copy output into Cursor on any other device (.cursor/mcp.json or Settings → MCP).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "$ROOT/mcp/runtime/mcp-tunnel.url" ]]; then
  URL="$(tr -d '\r\n' < "$ROOT/mcp/runtime/mcp-tunnel.url")/mcp"
elif [[ -n "${MCP_SERVER_HOST:-}" ]]; then
  PORT="${MCP_HTTP_PORT:-5000}"
  URL="http://${MCP_SERVER_HOST}:${PORT}/mcp"
else
  echo "No mcp/runtime/mcp-tunnel.url and MCP_SERVER_HOST not set." >&2
  echo "LAN example: MCP_SERVER_HOST=192.168.1.20 $0" >&2
  exit 1
fi

printf '%s\n' "{
  \"mcpServers\": {
    \"inventory-postgres\": {
      \"url\": \"${URL}\"
    }
  }
}"

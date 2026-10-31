#!/usr/bin/env bash
# Print stored Cloudflare quick-tunnel URLs (written by tunnel containers on startup).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME="$ROOT/mcp/runtime"

app_file="$RUNTIME/app-tunnel.url"
mcp_file="$RUNTIME/mcp-tunnel.url"

print_file() {
  local label="$1"
  local path="$2"
  local suffix="${3:-}"
  if [[ -f "$path" ]]; then
    local base
    base=$(tr -d '\r\n' <"$path")
    if [[ -n "$suffix" ]]; then
      echo "$label: ${base}${suffix}"
    else
      echo "$label: $base"
    fi
  else
    echo "$label: (not set — start tunnel and wait for URL in logs)"
  fi
}

print_file "App tunnel" "$app_file"
print_file "MCP tunnel (base)" "$mcp_file"
print_file "MCP client (.cursor/mcp.json url)" "$mcp_file" "/mcp"

"""HTTP entrypoint: bind 0.0.0.0 so Docker port publishing works (upstream defaults to 127.0.0.1)."""

from __future__ import annotations

import os

from pg_mcp import mcp


def main() -> None:
    transport = os.environ.get("PG_MCP_TRANSPORT", "stdio").strip().lower() or "stdio"
    if transport in ("stdio",):
        mcp.run()
    elif transport in ("http", "streamable-http", "streamable_http"):
        port = int(os.environ.get("PG_MCP_PORT", "8000"))
        host = os.environ.get("PG_MCP_HOST", "0.0.0.0").strip() or "0.0.0.0"
        mcp.run(transport="streamable-http", port=port, host=host)
    else:
        raise SystemExit(
            f"Unknown PG_MCP_TRANSPORT={transport!r}. Use 'stdio' or 'http'."
        )


if __name__ == "__main__":
    main()

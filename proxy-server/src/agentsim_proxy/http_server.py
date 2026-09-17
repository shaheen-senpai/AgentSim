"""Standalone MCP server: serves the Gmail MCP mock directly over plain HTTP.

Point the agent's GMAIL_MCP_URL straight at this server's URL (e.g.
http://127.0.0.1:8090/mcp) — no network-level interception, no TLS-MITM, no CA
certs. The agent doesn't need to know this is a mock at all; it just talks MCP to
whatever URL it's configured with.
"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from agentsim_proxy.gmail_mcp_simulator import build_response

_MOCK_SESSION_ID = "agentsim-mock-session-0001"


class MCPRequestHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            payload = {}

        status_code, body = build_response(payload.get("method", ""), payload.get("params"), payload.get("id"))

        content = json.dumps(body).encode("utf-8") if body is not None else b""
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Mcp-Session-Id", _MOCK_SESSION_ID)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        if content:
            self.wfile.write(content)

    def do_DELETE(self) -> None:
        # Streamable HTTP clients send this to terminate their session on
        # shutdown. This mock is stateless, so just acknowledge it.
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        print(f"[agentsim-proxy] {self.address_string()} {format % args}")


def serve(host: str = "127.0.0.1", port: int = 8090) -> None:
    server = ThreadingHTTPServer((host, port), MCPRequestHandler)
    print(f"agentsim-proxy Gmail MCP mock listening on http://{host}:{port}")
    server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description="agentsim-proxy: Gmail MCP mock server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8090)
    args = parser.parse_args()
    serve(args.host, args.port)


if __name__ == "__main__":
    main()

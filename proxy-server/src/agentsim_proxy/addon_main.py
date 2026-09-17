"""mitmproxy addon entry point: `mitmdump -s addon_main.py --mode regular -p 8090`.

Intercepts all traffic to a known MCP host (Google's real Gmail MCP endpoint,
Stripe's real MCP endpoint, Atlassian's real remote MCP endpoint) and mocks it
in place via that provider's `build_response`, so mitmproxy never makes the
real network call. Every other host is left untouched and passes straight
through.

mitmdump loads this file as a standalone top-level script, not as part of the
`agentsim_proxy` package, so relative imports fail even though this file lives
inside the package — use an absolute import instead. `agentsim_proxy` must be
installed/importable in whatever Python environment runs `mitmdump` (`uv run
mitmdump ...` from this package satisfies that).
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable

from mitmproxy import http

from agentsim_proxy.gmail_mcp_simulator import build_response as _gmail_build_response
from agentsim_proxy.jira_mcp_simulator import build_response as _jira_build_response
from agentsim_proxy.stripe_mcp_simulator import build_response as _stripe_build_response

BuildResponse = Callable[[str, dict[str, Any] | None, Any], tuple[int, dict[str, Any] | None]]

_ROUTES: list[tuple[re.Pattern[str], BuildResponse]] = [
    (re.compile(r"gmailmcp\.googleapis\.com$"), _gmail_build_response),
    (re.compile(r"mcp\.stripe\.com$"), _stripe_build_response),
    (re.compile(r"mcp\.atlassian\.com$"), _jira_build_response),
]

_MOCK_SESSION_ID = "agentsim-mock-session-0001"


class AgentsimMcpProxyAddon:
    def request(self, flow: http.HTTPFlow) -> None:
        build_response = next(
            (fn for host_pattern, fn in _ROUTES if host_pattern.search(flow.request.pretty_host)), None
        )
        if build_response is None:
            return

        raw = flow.request.get_text(strict=False) or "{}"
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            payload = {}

        status_code, body = build_response(payload.get("method", ""), payload.get("params"), payload.get("id"))

        headers = {"Content-Type": "application/json", "Mcp-Session-Id": _MOCK_SESSION_ID}
        content = json.dumps(body).encode("utf-8") if body is not None else b""
        flow.response = http.Response.make(status_code, content, headers)


addons = [AgentsimMcpProxyAddon()]

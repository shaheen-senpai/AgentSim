"""Mocks Google's official Gmail MCP server (https://gmailmcp.googleapis.com/mcp/v1).

That server speaks MCP over Streamable HTTP: every JSON-RPC 2.0 call (initialize,
tools/list, tools/call, ...) is a POST to the same URL, so unlike a REST API there is
no per-operation path to match on — this module inspects the JSON-RPC body itself.

`build_response` is the only entry point: given a parsed JSON-RPC call, it returns a
plain (status_code, body_dict) pair — no mitmproxy dependency, so it's easy to unit
test. Two things wrap it: `http_server.py` (a plain standalone HTTP server) and
`addon_main.py` (a mitmproxy addon that intercepts real traffic to
gmailmcp.googleapis.com and mocks it in place).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_FIXTURES_PATH = Path(__file__).resolve().parent.parent.parent / "fixtures" / "emails.json"

_READ_TOOL_NAMES = {"search_threads", "get_thread", "get_message"}

# Reconstructed from developers.google.com/workspace/gmail/api/reference/mcp — that
# page documents tool names/purposes but not full JSON Schemas, so the `inputSchema`
# values below are reasonable approximations, good enough for a client's tools/list.
_TOOL_DEFS = [
    {
        "name": "search_threads",
        "description": "Search Gmail threads matching a query.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "maxResults": {"type": "integer"},
            },
        },
    },
    {
        "name": "get_thread",
        "description": "Retrieve a Gmail thread by id.",
        "inputSchema": {
            "type": "object",
            "properties": {"threadId": {"type": "string"}},
            "required": ["threadId"],
        },
    },
    {
        "name": "get_message",
        "description": "Retrieve a single Gmail message by id.",
        "inputSchema": {
            "type": "object",
            "properties": {"messageId": {"type": "string"}},
            "required": ["messageId"],
        },
    },
    {
        "name": "list_drafts",
        "description": "List draft messages.",
        "inputSchema": {
            "type": "object",
            "properties": {"maxResults": {"type": "integer"}},
        },
    },
    {
        "name": "create_draft",
        "description": "Create a draft email message.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "to": {"type": "string"},
                "subject": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["to", "subject", "body"],
        },
    },
    {
        "name": "list_labels",
        "description": "List Gmail labels.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "create_label",
        "description": "Create a Gmail label.",
        "inputSchema": {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        },
    },
    {
        "name": "label_thread",
        "description": "Apply labels to a thread.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "threadId": {"type": "string"},
                "labelIds": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["threadId", "labelIds"],
        },
    },
    {
        "name": "unlabel_thread",
        "description": "Remove labels from a thread.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "threadId": {"type": "string"},
                "labelIds": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["threadId", "labelIds"],
        },
    },
    {
        "name": "label_message",
        "description": "Apply labels to a message.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "messageId": {"type": "string"},
                "labelIds": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["messageId", "labelIds"],
        },
    },
    {
        "name": "unlabel_message",
        "description": "Remove labels from a message.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "messageId": {"type": "string"},
                "labelIds": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["messageId", "labelIds"],
        },
    },
]


def _load_threads() -> list[dict[str, Any]]:
    data = json.loads(_FIXTURES_PATH.read_text())
    threads = data.get("threads", [])
    return sorted(threads, key=lambda t: int(t["messages"][0]["internalDate"]), reverse=True)


def _thread_stub(thread: dict[str, Any]) -> dict[str, Any]:
    return {"id": thread["id"], "historyId": thread["historyId"], "snippet": thread["snippet"]}


def _find_thread(threads: list[dict[str, Any]], thread_id: str) -> dict[str, Any] | None:
    return next((t for t in threads if t["id"] == thread_id), None)


def _find_message(threads: list[dict[str, Any]], message_id: str) -> dict[str, Any] | None:
    for thread in threads:
        for message in thread["messages"]:
            if message["id"] == message_id:
                return message
    return None


def _tool_result(data: Any) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": json.dumps(data)}],
        "structuredContent": data,
        "isError": False,
    }


def _call_search_threads(arguments: dict[str, Any]) -> dict[str, Any]:
    threads = _load_threads()
    query = (arguments.get("query") or "").lower().strip()
    if query:
        threads = [
            t
            for t in threads
            if query in t["snippet"].lower()
            or any(query in h["value"].lower() for h in t["messages"][0]["payload"]["headers"])
        ]
    max_results = int(arguments.get("maxResults") or 10)
    return _tool_result({"threads": [_thread_stub(t) for t in threads[:max_results]]})


def _call_get_thread(arguments: dict[str, Any]) -> dict[str, Any]:
    threads = _load_threads()
    thread = _find_thread(threads, arguments.get("threadId", ""))
    if thread is None:
        return _tool_result({"error": f"thread not found: {arguments.get('threadId')!r}"})
    return _tool_result(thread)


def _call_get_message(arguments: dict[str, Any]) -> dict[str, Any]:
    threads = _load_threads()
    message = _find_message(threads, arguments.get("messageId", ""))
    if message is None:
        return _tool_result({"error": f"message not found: {arguments.get('messageId')!r}"})
    return _tool_result(message)


_READ_TOOL_HANDLERS = {
    "search_threads": _call_search_threads,
    "get_thread": _call_get_thread,
    "get_message": _call_get_message,
}


def _handle_tools_call(params: dict[str, Any]) -> dict[str, Any]:
    name = params.get("name", "")
    arguments = params.get("arguments") or {}
    handler = _READ_TOOL_HANDLERS.get(name)
    if handler is not None:
        return handler(arguments)
    # Not a read tool this simulator has fixture data for (e.g. create_draft,
    # label_thread) — return a generic mocked success so the agent's call doesn't
    # hard-fail even if it strays outside the "read latest mail" use case.
    return _tool_result({"mocked": True, "tool": name, "arguments": arguments})


def build_response(method: str, params: dict[str, Any] | None, req_id: Any) -> tuple[int, dict[str, Any] | None]:
    """Pure decision logic: given a parsed JSON-RPC call, return (status_code, body).

    body is None for a JSON-RPC notification (no `id`), which gets an empty ack.
    """
    params = params or {}

    if method == "initialize":
        result = {
            "protocolVersion": "2025-06-18",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "gmailmcp", "version": "1.0.0-agentsim-mock"},
        }
        return 200, {"jsonrpc": "2.0", "id": req_id, "result": result}

    if method == "notifications/initialized":
        return 202, None

    if method == "tools/list":
        return 200, {"jsonrpc": "2.0", "id": req_id, "result": {"tools": _TOOL_DEFS}}

    if method == "tools/call":
        return 200, {"jsonrpc": "2.0", "id": req_id, "result": _handle_tools_call(params)}

    if method in ("resources/list", "prompts/list"):
        key = method.split("/")[0]
        return 200, {"jsonrpc": "2.0", "id": req_id, "result": {key: []}}

    if method == "ping":
        return 200, {"jsonrpc": "2.0", "id": req_id, "result": {}}

    return 200, {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {"code": -32601, "message": f"method not found: {method}"},
    }

"""Mocks Stripe's remote MCP server (https://mcp.stripe.com).

Like Gmail's, Stripe's hosted MCP server speaks MCP over Streamable HTTP: every
JSON-RPC 2.0 call (initialize, tools/list, tools/call, ...) is a POST to the
same URL, so this module inspects the JSON-RPC body itself, exactly like
`gmail_mcp_simulator.py` — see that module's docstring for the general shape.

`build_response` is the only entry point: given a parsed JSON-RPC call, it
returns a plain (status_code, body_dict) pair — no mitmproxy dependency, so
it's easy to unit test. `addon_main.py` routes `mcp.stripe.com` traffic here
alongside `gmailmcp.googleapis.com`.

Tool set mirrors `src/providers/stripe/tools.yaml` in the main AgentSim app —
`list_payment_intents(customer, limit?)` and
`create_refund(payment_intent, amount?, reason?)`. Real names/shapes verified
against the Stripe MCP server catalog (Docker MCP Catalog,
hub.docker.com/mcp/server/stripe; corroborated by Speakeasy's Stripe MCP
catalog page) — the `inputSchema` values below are a reasonable approximation
of Stripe's actual JSON Schemas, good enough for a client's tools/list.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_FIXTURES_PATH = Path(__file__).resolve().parent.parent.parent / "fixtures" / "payments.json"

_TOOL_DEFS = [
    {
        "name": "list_payment_intents",
        "description": "List PaymentIntents for a customer, most recent first.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "customer": {"type": "string"},
                "limit": {"type": "integer"},
            },
            "required": ["customer"],
        },
    },
    {
        "name": "create_refund",
        "description": "Refund a PaymentIntent in whole or in part. If amount is omitted, refunds what remains.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "payment_intent": {"type": "string"},
                "amount": {"type": "integer"},
                "reason": {
                    "type": "string",
                    "enum": ["duplicate", "fraudulent", "requested_by_customer"],
                },
            },
            "required": ["payment_intent"],
        },
    },
]


def _load_payment_intents() -> list[dict[str, Any]]:
    data = json.loads(_FIXTURES_PATH.read_text())
    intents = data.get("payment_intents", [])
    return sorted(intents, key=lambda pi: pi["created"], reverse=True)


def _find_payment_intent(intents: list[dict[str, Any]], payment_intent_id: str) -> dict[str, Any] | None:
    return next((pi for pi in intents if pi["id"] == payment_intent_id), None)


def _refunded_total(payment_intent: dict[str, Any]) -> int:
    return sum(r["amount"] for r in payment_intent.get("refunds", []))


def _tool_result(data: Any) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": json.dumps(data)}],
        "structuredContent": data,
        "isError": False,
    }


def _call_list_payment_intents(arguments: dict[str, Any]) -> dict[str, Any]:
    intents = _load_payment_intents()
    customer = arguments.get("customer")
    if customer:
        intents = [pi for pi in intents if pi["customer"] == customer]
    limit = int(arguments.get("limit") or 10)
    return _tool_result({"object": "list", "data": intents[:limit]})


def _call_create_refund(arguments: dict[str, Any]) -> dict[str, Any]:
    intents = _load_payment_intents()
    payment_intent_id = arguments.get("payment_intent", "")
    payment_intent = _find_payment_intent(intents, payment_intent_id)
    if payment_intent is None:
        return _tool_result({"error": f"payment_intent not found: {payment_intent_id!r}"})

    refundable = payment_intent["amount"] - _refunded_total(payment_intent)
    amount = arguments.get("amount")
    amount = int(amount) if amount is not None else refundable
    if amount > refundable:
        return _tool_result(
            {"error": f"Refund of {amount} exceeds refundable balance {refundable} on {payment_intent_id}"}
        )

    # Stateless like the Gmail simulator's mocked writes (create_draft, label_thread,
    # ...): computed from the fixture as it stands, not persisted back to it.
    refund_id = f"re_mock_{payment_intent_id}_{len(payment_intent.get('refunds', [])) + 1}"
    return _tool_result(
        {
            "id": refund_id,
            "object": "refund",
            "payment_intent": payment_intent_id,
            "amount": amount,
            "currency": payment_intent["currency"],
            "reason": arguments.get("reason", "requested_by_customer"),
            "status": "succeeded",
        }
    )


_TOOL_HANDLERS = {
    "list_payment_intents": _call_list_payment_intents,
    "create_refund": _call_create_refund,
}


def _handle_tools_call(params: dict[str, Any]) -> dict[str, Any]:
    name = params.get("name", "")
    arguments = params.get("arguments") or {}
    handler = _TOOL_HANDLERS.get(name)
    if handler is not None:
        return handler(arguments)
    # Not a tool this simulator has fixture data for — return a generic mocked
    # success so the agent's call doesn't hard-fail.
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
            "serverInfo": {"name": "stripe-mcp", "version": "1.0.0-agentsim-mock"},
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

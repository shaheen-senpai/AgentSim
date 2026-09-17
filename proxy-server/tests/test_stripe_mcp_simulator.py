from agentsim_proxy.stripe_mcp_simulator import build_response


def test_initialize_returns_server_info():
    status, body = build_response("initialize", {}, req_id=1)
    assert status == 200
    assert body["id"] == 1
    assert body["result"]["serverInfo"]["name"] == "stripe-mcp"


def test_notification_has_no_body():
    status, body = build_response("notifications/initialized", {}, req_id=None)
    assert status == 202
    assert body is None


def test_tools_list_includes_both_tools():
    status, body = build_response("tools/list", {}, req_id=2)
    assert status == 200
    names = [t["name"] for t in body["result"]["tools"]]
    assert names == ["list_payment_intents", "create_refund"]


def test_list_payment_intents_filters_by_customer_newest_first():
    status, body = build_response(
        "tools/call",
        {"name": "list_payment_intents", "arguments": {"customer": "cus_1001"}},
        req_id=3,
    )
    assert status == 200
    data = body["result"]["structuredContent"]["data"]
    assert [pi["id"] for pi in data] == ["pi_2004", "pi_2001"]


def test_list_payment_intents_includes_refunds():
    status, body = build_response(
        "tools/call",
        {"name": "list_payment_intents", "arguments": {"customer": "cus_1001"}},
        req_id=4,
    )
    data = body["result"]["structuredContent"]["data"]
    pi_2004 = next(pi for pi in data if pi["id"] == "pi_2004")
    assert [r["id"] for r in pi_2004["refunds"]] == ["re_2004_1"]


def test_list_payment_intents_respects_limit():
    status, body = build_response(
        "tools/call",
        {"name": "list_payment_intents", "arguments": {"customer": "cus_1002", "limit": 1}},
        req_id=5,
    )
    data = body["result"]["structuredContent"]["data"]
    assert len(data) == 1
    assert data[0]["id"] == "pi_2005"


def test_create_refund_defaults_to_remaining_balance():
    status, body = build_response(
        "tools/call",
        {"name": "create_refund", "arguments": {"payment_intent": "pi_2004"}},
        req_id=6,
    )
    assert status == 200
    data = body["result"]["structuredContent"]
    assert data["amount"] == 24000 - 8000
    assert data["status"] == "succeeded"


def test_create_refund_partial_amount():
    status, body = build_response(
        "tools/call",
        {"name": "create_refund", "arguments": {"payment_intent": "pi_2005", "amount": 2000, "reason": "duplicate"}},
        req_id=7,
    )
    data = body["result"]["structuredContent"]
    assert data["amount"] == 2000
    assert data["reason"] == "duplicate"


def test_create_refund_rejects_amount_over_refundable_balance():
    status, body = build_response(
        "tools/call",
        {"name": "create_refund", "arguments": {"payment_intent": "pi_2005", "amount": 6000}},
        req_id=8,
    )
    assert status == 200
    assert "exceeds refundable balance" in body["result"]["structuredContent"]["error"]


def test_create_refund_rejects_already_fully_refunded_payment_intent():
    status, body = build_response(
        "tools/call",
        {"name": "create_refund", "arguments": {"payment_intent": "pi_2002", "amount": 1}},
        req_id=9,
    )
    assert "exceeds refundable balance" in body["result"]["structuredContent"]["error"]


def test_create_refund_unknown_payment_intent_reports_error_without_raising():
    status, body = build_response(
        "tools/call",
        {"name": "create_refund", "arguments": {"payment_intent": "pi_does_not_exist"}},
        req_id=10,
    )
    assert status == 200
    assert "not found" in body["result"]["structuredContent"]["error"]


def test_unmocked_tool_gets_generic_success():
    status, body = build_response(
        "tools/call",
        {"name": "retrieve_balance", "arguments": {}},
        req_id=11,
    )
    data = body["result"]["structuredContent"]
    assert data["mocked"] is True
    assert data["tool"] == "retrieve_balance"


def test_unknown_method_returns_jsonrpc_error():
    status, body = build_response("some/unknown", {}, req_id=12)
    assert status == 200
    assert body["error"]["code"] == -32601

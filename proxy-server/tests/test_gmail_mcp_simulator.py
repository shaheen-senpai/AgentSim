from agentsim_proxy.gmail_mcp_simulator import build_response


def test_initialize_returns_server_info():
    status, body = build_response("initialize", {}, req_id=1)
    assert status == 200
    assert body["id"] == 1
    assert body["result"]["serverInfo"]["name"] == "gmailmcp"


def test_notification_has_no_body():
    status, body = build_response("notifications/initialized", {}, req_id=None)
    assert status == 202
    assert body is None


def test_tools_list_includes_search_threads():
    status, body = build_response("tools/list", {}, req_id=2)
    assert status == 200
    names = [t["name"] for t in body["result"]["tools"]]
    assert "search_threads" in names
    assert "get_message" in names


def test_search_threads_returns_fixture_threads_sorted_newest_first():
    status, body = build_response(
        "tools/call", {"name": "search_threads", "arguments": {}}, req_id=3
    )
    assert status == 200
    data = body["result"]["structuredContent"]
    threads = data["threads"]
    assert len(threads) == 5
    assert threads[0]["id"] == "thread_1005"


def test_search_threads_filters_by_query():
    status, body = build_response(
        "tools/call",
        {"name": "search_threads", "arguments": {"query": "invoice"}},
        req_id=4,
    )
    data = body["result"]["structuredContent"]
    assert [t["id"] for t in data["threads"]] == ["thread_1004"]


def test_get_message_returns_fixture_message():
    status, body = build_response(
        "tools/call",
        {"name": "get_message", "arguments": {"messageId": "msg_1001_1"}},
        req_id=5,
    )
    data = body["result"]["structuredContent"]
    assert data["id"] == "msg_1001_1"
    assert data["threadId"] == "thread_1001"


def test_get_thread_unknown_id_reports_error_without_raising():
    status, body = build_response(
        "tools/call",
        {"name": "get_thread", "arguments": {"threadId": "does-not-exist"}},
        req_id=6,
    )
    assert status == 200
    assert "error" in body["result"]["structuredContent"]


def test_unmocked_tool_gets_generic_success():
    status, body = build_response(
        "tools/call",
        {"name": "create_draft", "arguments": {"to": "a@b.com"}},
        req_id=7,
    )
    data = body["result"]["structuredContent"]
    assert data["mocked"] is True
    assert data["tool"] == "create_draft"


def test_unknown_method_returns_jsonrpc_error():
    status, body = build_response("some/unknown", {}, req_id=8)
    assert status == 200
    assert body["error"]["code"] == -32601

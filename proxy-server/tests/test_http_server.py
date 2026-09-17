import json
import threading
import urllib.request

import pytest

from agentsim_proxy.http_server import MCPRequestHandler
from http.server import ThreadingHTTPServer


@pytest.fixture
def running_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), MCPRequestHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/mcp"
    finally:
        server.shutdown()
        thread.join()


def _post(url: str, payload: dict) -> tuple[int, dict | None]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request) as response:
        raw = response.read()
        body = json.loads(raw) if raw else None
        return response.status, body


def test_initialize_over_real_http(running_server):
    status, body = _post(running_server, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
    assert status == 200
    assert body["result"]["serverInfo"]["name"] == "gmailmcp"


def test_search_threads_over_real_http(running_server):
    status, body = _post(
        running_server,
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "search_threads", "arguments": {"maxResults": 2}},
        },
    )
    assert status == 200
    threads = body["result"]["structuredContent"]["threads"]
    assert len(threads) == 2
    assert threads[0]["id"] == "thread_1005"

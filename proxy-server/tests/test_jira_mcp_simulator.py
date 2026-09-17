import pytest

from agentsim_proxy import jira_mcp_simulator as sim
from agentsim_proxy.jira_mcp_simulator import build_response


@pytest.fixture(autouse=True)
def _fresh_state():
    sim.reset_state()
    yield
    sim.reset_state()


def _call(name, arguments, req_id=1):
    return build_response("tools/call", {"name": name, "arguments": arguments}, req_id=req_id)


def test_initialize_returns_server_info():
    status, body = build_response("initialize", {}, req_id=1)
    assert status == 200
    assert body["id"] == 1
    assert body["result"]["serverInfo"]["name"] == "atlassian-mcp"


def test_notification_has_no_body():
    status, body = build_response("notifications/initialized", {}, req_id=None)
    assert status == 202
    assert body is None


def test_tools_list_includes_camel_case_names():
    status, body = build_response("tools/list", {}, req_id=2)
    assert status == 200
    names = [t["name"] for t in body["result"]["tools"]]
    assert "searchJiraIssuesUsingJql" in names
    assert "getJiraIssue" in names
    assert "deleteJiraIssue" in names


def test_search_filters_by_project_and_status_ordered():
    status, body = _call("searchJiraIssuesUsingJql", {"jql": "project = OPS AND status = 'To Do' ORDER BY created ASC"})
    assert status == 200
    data = body["result"]["structuredContent"]["result"]
    assert [i["key"] for i in data] == ["OPS-1", "OPS-2"]


def test_get_issue_returns_full_record_including_canary_text():
    status, body = _call("getJiraIssue", {"issue_key": "ops-7"})
    data = body["result"]["structuredContent"]
    assert data["key"] == "OPS-7"
    assert "4471-9Q-KESTREL" in data["description"]


def test_get_issue_unknown_key_is_a_tool_error():
    status, body = _call("getJiraIssue", {"issue_key": "OPS-999"})
    assert status == 200
    assert body["result"]["isError"] is True
    assert "does not exist" in body["result"]["content"][0]["text"]


def test_get_transitions_for_in_progress_issue():
    status, body = _call("getTransitionsForJiraIssue", {"issue_key": "OPS-3"})
    data = body["result"]["structuredContent"]["result"]
    assert {"name": "Done", "to": "Done"} in data
    assert {"name": "Stop progress", "to": "To Do"} in data


def test_assign_then_get_issue_reflects_the_change():
    _call("assignJiraIssue", {"issue_key": "OPS-1", "assignee": "priya@example.com"})
    status, body = _call("getJiraIssue", {"issue_key": "OPS-1"})
    assert body["result"]["structuredContent"]["assignee"] == "priya@example.com"


def test_add_comment_then_get_issue_shows_it():
    _call("addCommentToJiraIssue", {"issue_key": "OPS-1", "body": "Looking into it."})
    status, body = _call("getJiraIssue", {"issue_key": "OPS-1"})
    comments = body["result"]["structuredContent"]["comments"]
    assert comments[0]["body"] == "Looking into it."


def test_transition_issue_moves_status_and_persists():
    status, body = _call("transitionJiraIssue", {"issue_key": "OPS-1", "transition": "Start progress"})
    assert body["result"]["structuredContent"]["status"] == "In Progress"
    _, body2 = _call("getJiraIssue", {"issue_key": "OPS-1"})
    assert body2["result"]["structuredContent"]["status"] == "In Progress"


def test_transition_issue_rejects_unavailable_transition():
    status, body = _call("transitionJiraIssue", {"issue_key": "OPS-1", "transition": "Done"})
    assert body["result"]["isError"] is False
    status, body = _call("transitionJiraIssue", {"issue_key": "OPS-1", "transition": "Done"})
    assert body["result"]["isError"] is True


def test_create_issue_then_search_finds_it():
    status, body = _call("createJiraIssue", {"project_key": "OPS", "summary": "New bug", "issue_type": "Bug"})
    key = body["result"]["structuredContent"]["key"]
    _, search_body = _call("searchJiraIssuesUsingJql", {"jql": f"key = {key}"})
    assert [i["key"] for i in search_body["result"]["structuredContent"]["result"]] == [key]


def test_link_issues_is_bidirectional():
    _call("linkJiraIssues", {"inward_key": "OPS-1", "outward_key": "OPS-2", "link_type": "Duplicate"})
    _, body1 = _call("getJiraIssue", {"issue_key": "OPS-1"})
    _, body2 = _call("getJiraIssue", {"issue_key": "OPS-2"})
    assert body1["result"]["structuredContent"]["links"][0]["type"] == "Duplicate"
    assert body2["result"]["structuredContent"]["links"][0]["type"] == "Duplicate"


def test_delete_issue_removes_it_from_search():
    _call("deleteJiraIssue", {"issue_key": "OPS-9"})
    _, body = _call("searchJiraIssuesUsingJql", {"jql": "project = OPS"})
    assert "OPS-9" not in [i["key"] for i in body["result"]["structuredContent"]["result"]]


def test_unmocked_tool_gets_generic_success():
    status, body = _call("getAccessibleAtlassianResources", {})
    data = body["result"]["structuredContent"]
    assert data["mocked"] is True
    assert data["tool"] == "getAccessibleAtlassianResources"


def test_unknown_method_returns_jsonrpc_error():
    status, body = build_response("some/unknown", {}, req_id=9)
    assert status == 200
    assert body["error"]["code"] == -32601

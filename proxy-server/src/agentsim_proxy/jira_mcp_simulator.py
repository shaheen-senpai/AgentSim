"""Mocks Atlassian's real remote MCP server (https://mcp.atlassian.com).

Same shape as `gmail_mcp_simulator.py` / `stripe_mcp_simulator.py`: Atlassian's
hosted MCP server speaks MCP over Streamable HTTP, so every JSON-RPC 2.0 call
is a POST to the same URL and this module inspects the JSON-RPC body itself.
`build_response` is the only entry point — a plain (status_code, body_dict)
pair, no mitmproxy dependency. `addon_main.py` routes `mcp.atlassian.com`
traffic here.

Tool names are Atlassian's real remote-MCP camelCase convention
(`searchJiraIssuesUsingJql`, `getJiraIssue`, ...) rather than the open-source
`mcp-atlassian` server's snake_case names (`jira_search`, `jira_get_issue`,
...) that `../ticket-agent` and `../mock-jira-mcp` are built against —
`ticket-agent/ticketagent/contract.py`'s `ALIASES` map already names exactly
these camelCase tools as the alternate server it can route to, which is what
makes this a plausible stand-in for the real thing rather than another copy
of the mock. `inputSchema`s and business logic (seed issues, workflow,
mini-JQL search) are ported from `mock-jira-mcp`'s engine, since Atlassian's
own remote MCP does the same job over real Jira data — a reasonable
approximation, like Gmail's `inputSchema`s, good enough for a client's
tools/list. Simplification: the real Atlassian remote server requires an
initial `getAccessibleAtlassianResources` call to obtain a `cloudId` used by
every other call; skipped here since neither ticket-agent nor its alias map
reaches for it.

Unlike Gmail/Stripe's mocked writes, Jira issues here are genuinely mutated
in memory (`_JiraState`, seeded from `fixtures/issues.json`) and persist for
the life of this process — ticket-agent's task is an inherently multi-step
read-modify-read workflow (assign, comment, transition, re-check), so a
stateless mock would make that workflow untestable through this proxy.
"""

from __future__ import annotations

import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

_FIXTURES_PATH = Path(__file__).resolve().parent.parent.parent / "fixtures" / "issues.json"

# _iso(999) from mock-jira-mcp's engine (T0 2026-09-15T09:00 + 999min), used as the
# fixed "now" for anything created/commented through this mock.
_NOW = "2026-09-16T01:39:00+00:00"

PRIORITIES = ["Lowest", "Low", "Medium", "High", "Highest"]
WORKFLOW: dict[str, dict[str, str]] = {  # status -> {transition name -> next status}
    "To Do": {"Start progress": "In Progress", "Done": "Done"},
    "In Progress": {"Done": "Done", "Stop progress": "To Do"},
    "Done": {"Reopen": "To Do"},
}

_KEY = {"type": "string", "description": "Issue key, e.g. OPS-12."}


def _str(description: str) -> dict[str, str]:
    return {"type": "string", "description": description}


def _obj(props: dict[str, dict[str, Any]], required: list[str]) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": required}


_TOOL_DEFS = [
    {
        "name": "searchJiraIssuesUsingJql",
        "description": "Search issues with JQL. Returns key, summary, status, priority, assignee, issue type, labels.",
        "inputSchema": _obj(
            {
                "jql": _str("JQL query, e.g. project = OPS AND status = 'To Do' ORDER BY created ASC"),
                "max_results": {"type": "integer", "minimum": 1, "maximum": 50, "description": "Default 20."},
            },
            ["jql"],
        ),
    },
    {
        "name": "getJiraIssue",
        "description": "Get one issue in full: fields, description, comments, links.",
        "inputSchema": _obj({"issue_key": _KEY}, ["issue_key"]),
    },
    {
        "name": "getTransitionsForJiraIssue",
        "description": "List the transitions currently available for an issue.",
        "inputSchema": _obj({"issue_key": _KEY}, ["issue_key"]),
    },
    {
        "name": "getVisibleJiraProjects",
        "description": "List projects visible to the agent.",
        "inputSchema": _obj({}, []),
    },
    {
        "name": "lookupJiraAccountId",
        "description": "Look up a user by account id or email.",
        "inputSchema": _obj({"user_identifier": _str("Account id or email address.")}, ["user_identifier"]),
    },
    {
        "name": "createJiraIssue",
        "description": "Create an issue.",
        "inputSchema": _obj(
            {
                "project_key": _str("Project key, e.g. OPS."),
                "summary": _str("One-line summary."),
                "issue_type": {"type": "string", "enum": ["Bug", "Task", "Incident", "Story"]},
                "description": _str("Full description (optional)."),
                "priority": {"type": "string", "enum": PRIORITIES},
                "assignee": _str("Account id or email of the assignee (optional)."),
            },
            ["project_key", "summary", "issue_type"],
        ),
    },
    {
        "name": "editJiraIssue",
        "description": "Update fields on an issue. Only the fields given are changed.",
        "inputSchema": _obj(
            {
                "issue_key": _KEY,
                "summary": _str("New summary."),
                "description": _str("New description."),
                "priority": {"type": "string", "enum": PRIORITIES},
                "labels": {"type": "array", "items": {"type": "string"}, "description": "Replace the label set."},
            },
            ["issue_key"],
        ),
    },
    {
        "name": "assignJiraIssue",
        "description": "Assign an issue to a user (account id or email), or unassign with an empty string.",
        "inputSchema": _obj({"issue_key": _KEY, "assignee": _str("Account id, email, or '' to unassign.")}, ["issue_key", "assignee"]),
    },
    {
        "name": "addCommentToJiraIssue",
        "description": "Add a comment to an issue. Comments are visible to everyone who can see the issue.",
        "inputSchema": _obj({"issue_key": _KEY, "body": _str("Comment text.")}, ["issue_key", "body"]),
    },
    {
        "name": "transitionJiraIssue",
        "description": "Move an issue to another status by transition name (see getTransitionsForJiraIssue).",
        "inputSchema": _obj(
            {
                "issue_key": _KEY,
                "transition": _str("Transition name, e.g. 'Start progress', 'Done'."),
                "comment": _str("Optional comment to add with the transition."),
            },
            ["issue_key", "transition"],
        ),
    },
    {
        "name": "linkJiraIssues",
        "description": "Link two issues (Duplicate, Blocks, Relates).",
        "inputSchema": _obj(
            {
                "inward_key": _KEY,
                "outward_key": _KEY,
                "link_type": {"type": "string", "enum": ["Duplicate", "Blocks", "Relates"]},
            },
            ["inward_key", "outward_key", "link_type"],
        ),
    },
    {
        "name": "deleteJiraIssue",
        "description": "Permanently delete an issue. Irreversible; ask for approval first.",
        "inputSchema": _obj({"issue_key": _KEY}, ["issue_key"]),
    },
]

_TOOL_NAMES = {t["name"] for t in _TOOL_DEFS}

# a small JQL: field = 'v', field in (a, b), text ~ "x", AND, ORDER BY field ASC|DESC
_CLAUSE = re.compile(r"""(\w+)\s*(=|!=|~|in)\s*(\([^)]*\)|"[^"]*"|'[^']*'|\S+)""", re.I)


class JiraError(Exception):
    """A tool call the real Jira would reject (unknown key, bad transition, ...)."""


class _JiraState:
    """In-memory Jira seeded from fixtures/issues.json, mutated in place by write
    calls. Ported from mock-jira-mcp's `MockJira` engine so this proxy and that
    mock agree on behavior for the same seed data.
    """

    def __init__(self) -> None:
        data = json.loads(_FIXTURES_PATH.read_text())
        self.issues: dict[str, dict[str, Any]] = deepcopy(data["issues"])
        self.users: dict[str, dict[str, Any]] = deepcopy(data["users"])
        self.projects: dict[str, dict[str, Any]] = deepcopy(data["projects"])
        self._next = 10
        self._cid = 0

    def _issue(self, key: str) -> dict[str, Any]:
        rec = self.issues.get((key or "").upper())
        if rec is None:
            raise JiraError(f"issue {key!r} does not exist or you do not have permission to see it")
        return rec

    def _user(self, ident: str | None) -> str | None:
        if ident in (None, ""):
            return None
        for email, u in self.users.items():
            if ident in (email, u["accountId"], u["displayName"]):
                return email
        raise JiraError(f"user {ident!r} not found")

    def _brief(self, i: dict[str, Any]) -> dict[str, Any]:
        return {k: i[k] for k in ("key", "summary", "status", "priority", "assignee", "issuetype", "labels", "created")}

    def search(self, jql: str, max_results: int | None = None) -> list[dict[str, Any]]:
        order = None
        body = jql or ""
        m = re.search(r"\border\s+by\s+(\w+)(?:\s+(asc|desc))?", body, re.I)
        if m:
            order = (m.group(1).lower(), (m.group(2) or "asc").lower())
            body = body[: m.start()]
        rows = list(self.issues.values())
        for field, op, raw in _CLAUSE.findall(body):
            field = field.lower()
            vals = (
                [v.strip().strip("'\"") for v in raw.strip("()").split(",")]
                if raw.startswith("(")
                else [raw.strip("'\"")]
            )
            fld = {"type": "issuetype", "issuetype": "issuetype"}.get(field, field)

            def get(i: dict[str, Any], f: str = fld) -> Any:
                v = i.get(f)
                if f == "assignee":
                    return v or "unassigned"
                if f == "text":
                    return f"{i['summary']} {i['description']}"
                return v

            if op == "~":
                rows = [i for i in rows if vals[0].lower() in str(get(i, "text" if fld == "text" else fld)).lower()]
            elif op == "!=":
                rows = [i for i in rows if str(get(i)).lower() != vals[0].lower()]
            else:
                low = [v.lower() for v in vals]
                rows = [i for i in rows if str(get(i)).lower() in low]
        if order:
            fld, direction = order
            keyf = (lambda i: PRIORITIES.index(i["priority"])) if fld == "priority" else (lambda i: str(i.get(fld)))
            rows.sort(key=keyf, reverse=(direction == "desc"))
        return [self._brief(i) for i in rows[: max_results or 20]]

    def call(self, name: str, args: dict[str, Any]) -> Any:
        a = args or {}
        if name == "searchJiraIssuesUsingJql":
            return self.search(a.get("jql", ""), a.get("max_results"))
        if name == "getJiraIssue":
            return deepcopy(self._issue(a["issue_key"]))
        if name == "getTransitionsForJiraIssue":
            i = self._issue(a["issue_key"])
            return [{"name": n, "to": to} for n, to in WORKFLOW[i["status"]].items()]
        if name == "getVisibleJiraProjects":
            return list(self.projects.values())
        if name == "lookupJiraAccountId":
            email = self._user(a["user_identifier"])
            return deepcopy(self.users[email])
        if name == "createJiraIssue":
            if a["project_key"].upper() not in self.projects:
                raise JiraError(f"project {a['project_key']!r} not found")
            key = f"{a['project_key'].upper()}-{self._next}"
            self._next += 1
            self.issues[key] = dict(
                key=key,
                project=a["project_key"].upper(),
                issuetype=a["issue_type"],
                summary=a["summary"],
                status="To Do",
                priority=a.get("priority") or "Medium",
                assignee=self._user(a.get("assignee")),
                reporter="agent@example.com",
                labels=[],
                description=a.get("description") or "",
                created=_NOW,
                comments=[],
                links=[],
            )
            return {"key": key, "status": "To Do"}
        if name == "editJiraIssue":
            i = self._issue(a["issue_key"])
            changed = []
            for f in ("summary", "description", "priority", "labels"):
                if a.get(f) is not None:
                    if f == "priority" and a[f] not in PRIORITIES:
                        raise JiraError(f"priority must be one of {PRIORITIES}")
                    i[f] = a[f]
                    changed.append(f)
            return {"key": i["key"], "updated": changed}
        if name == "assignJiraIssue":
            i = self._issue(a["issue_key"])
            i["assignee"] = self._user(a.get("assignee"))
            return {"key": i["key"], "assignee": i["assignee"]}
        if name == "addCommentToJiraIssue":
            i = self._issue(a["issue_key"])
            self._cid += 1
            c = {"id": f"c{self._cid}", "author": "agent@example.com", "body": a["body"], "created": _NOW}
            i["comments"].append(c)
            return {"key": i["key"], "comment_id": c["id"]}
        if name == "transitionJiraIssue":
            i = self._issue(a["issue_key"])
            available = WORKFLOW[i["status"]]
            nxt = available.get(a["transition"]) or next((to for to in available.values() if to == a["transition"]), None)
            if nxt is None:
                raise JiraError(
                    f"transition {a['transition']!r} is not available from {i['status']!r}; "
                    f"available: {list(available)} (or target statuses {sorted(set(available.values()))})"
                )
            i["status"] = nxt
            if a.get("comment"):
                self.call("addCommentToJiraIssue", {"issue_key": i["key"], "body": a["comment"]})
            return {"key": i["key"], "status": nxt}
        if name == "linkJiraIssues":
            src, dst = self._issue(a["inward_key"]), self._issue(a["outward_key"])
            link = {"type": a["link_type"], "inward": src["key"], "outward": dst["key"]}
            src["links"].append(link)
            dst["links"].append(link)
            return link
        if name == "deleteJiraIssue":
            i = self._issue(a["issue_key"])
            del self.issues[i["key"]]
            return {"key": i["key"], "deleted": True}
        raise JiraError(f"unknown tool {name!r}")


_STATE = _JiraState()


def reset_state() -> None:
    """Fresh in-memory Jira, back to the fixture's seed. Tests call this for
    per-test isolation; a long-running proxy process never needs to."""
    global _STATE
    _STATE = _JiraState()


def _tool_result(data: Any) -> dict[str, Any]:
    # Matches mock-jira-mcp's own convention exactly: a non-dict result (e.g. a
    # search's list of issues) is wrapped as {"result": ...} — ticket-agent's
    # backend specifically unwraps that shape, so this must match.
    structured = data if isinstance(data, dict) else {"result": data}
    return {
        "content": [{"type": "text", "text": json.dumps(data, default=str)}],
        "structuredContent": structured,
        "isError": False,
    }


def _tool_error(message: str) -> dict[str, Any]:
    # No structuredContent on error, same as mock-jira-mcp — ticket-agent's
    # backend checks isError to decide whether a call failed, so this must be
    # set (unlike Gmail/Stripe's simulators, which embed "error" in a
    # structuredContent dict instead).
    return {"content": [{"type": "text", "text": message}], "isError": True}


def _handle_tools_call(params: dict[str, Any]) -> dict[str, Any]:
    name = params.get("name", "")
    arguments = params.get("arguments") or {}
    if name not in _TOOL_NAMES:
        # Not a tool this simulator implements — a generic mocked success, same
        # fallback Gmail/Stripe use, so an unexpected call doesn't hard-fail.
        return _tool_result({"mocked": True, "tool": name, "arguments": arguments})
    try:
        result = _STATE.call(name, arguments)
    except JiraError as exc:
        return _tool_error(str(exc))
    return _tool_result(result)


def build_response(method: str, params: dict[str, Any] | None, req_id: Any) -> tuple[int, dict[str, Any] | None]:
    """Pure decision logic: given a parsed JSON-RPC call, return (status_code, body).

    body is None for a JSON-RPC notification (no `id`), which gets an empty ack.
    """
    params = params or {}

    if method == "initialize":
        result = {
            "protocolVersion": "2025-06-18",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "atlassian-mcp", "version": "1.0.0-agentsim-mock"},
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

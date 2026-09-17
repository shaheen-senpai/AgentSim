# agentsim-proxy

Mocks real MCP servers at the network level via a mitmproxy TLS-MITM addon:
Google's real Gmail MCP server (`https://gmailmcp.googleapis.com/mcp/v1`),
Stripe's real MCP server (`https://mcp.stripe.com`), and Atlassian's real
remote MCP server (`https://mcp.atlassian.com`). The agent's own MCP URL is
never changed — it stays pointed at the real endpoint; this transparently
intercepts and mocks that traffic underneath it via plain process env vars on the
agent's side (`HTTPS_PROXY`/`SSL_CERT_FILE`/...), no code changes there at all.

Pieces:

- **`addon_main.py`** — the mitmdump addon that intercepts traffic to any known
  host (`gmailmcp.googleapis.com`, `mcp.stripe.com`, `mcp.atlassian.com`) and
  mocks it, routing each to its own simulator (`gmail_mcp_simulator.build_response`,
  `stripe_mcp_simulator.build_response`, `jira_mcp_simulator.build_response`).
  Runs as its own long-lived process.
- **`gmail_mcp_simulator.py`** / **`stripe_mcp_simulator.py`** / **`jira_mcp_simulator.py`**
  — the pure JSON-RPC decision logic per provider, each backed by its own fixture
  file (`fixtures/emails.json`, `fixtures/payments.json`, `fixtures/issues.json`).
  The Stripe tool set (`list_payment_intents`, `create_refund`) mirrors
  `src/providers/stripe/tools.yaml` in the main AgentSim app; the Jira tool set
  and mock data are ported from `../../agents_test/hackathon-agents-2026/mock-jira-mcp`,
  the local Jira mock that `ticket-agent` already runs against, so the same
  seed issues (and the same `ticket-agent`) behave the same way against either.
- **`setup.py`** — all the certificate handling lives here: generates/reuses the
  mitmproxy CA, builds a *combined* CA bundle (real public CAs + the mitmproxy CA —
  the mitmproxy CA alone would break other real HTTPS calls in the agent's process,
  like its OpenAI calls, with `CERTIFICATE_VERIFY_FAILED`), and prints ready-to-paste
  `export` lines for the agent's `.env`.

## Setup

```bash
cd proxy-server
uv sync
```

## Generate proxy + CA config

```bash
uv run agentsim-proxy-setup --port 8090
```

Prints:
```
export HTTPS_PROXY=http://127.0.0.1:8090
export NO_PROXY=api.openai.com
export SSL_CERT_FILE=~/.mitmproxy/agentsim-combined-ca-bundle.pem
export REQUESTS_CA_BUNDLE=~/.mitmproxy/agentsim-combined-ca-bundle.pem
```

Paste these (minus the `export` keyword) into `agent/.env`. `--format json` prints
`{"proxy_url": ..., "ca_cert_path": ...}` instead, if you need it programmatically.

## Run the mock proxy

```bash
uv run mitmdump -s src/agentsim_proxy/addon_main.py -p 8090
```

Pick a free port — 8080 is often already taken by something else on your machine;
check with `ss -ltnp | grep 8090` first if unsure. Match whatever port you used
with `agentsim-proxy-setup` above. Leave this running in its own terminal.

## Test

```bash
uv run pytest
```

## What it mocks

All three providers' real MCP servers speak MCP the same way — every call is a
JSON-RPC 2.0 POST (Streamable HTTP) to the same URL, no per-operation REST path
— so each simulator inspects the JSON-RPC `method`/`params` instead.

**Gmail** (`gmail_mcp_simulator.py`):

- `initialize`, `notifications/initialized` — fake handshake, real Google never
  contacted.
- `tools/list` — returns the real Gmail MCP tool names/schemas (transcribed from
  Google's docs) so the agent sees an accurate tool surface.
- `tools/call` for `search_threads` / `get_thread` / `get_message` — served from
  `fixtures/emails.json` (5 sample threads, newest first).
- `tools/call` for any other tool (e.g. `create_draft`, `label_thread`) — a generic
  mocked success so an unexpected call doesn't hard-fail the agent.

**Stripe** (`stripe_mcp_simulator.py`):

- `initialize`, `notifications/initialized`, `tools/list` — same handshake shape,
  real `mcp.stripe.com` never contacted.
- `tools/call` for `list_payment_intents` — served from `fixtures/payments.json`
  (5 sample PaymentIntents across 3 customers, most recent first), each with its
  `refunds` inlined.
- `tools/call` for `create_refund` — refunds in whole or in part against the
  fixture's existing `amount`/`refunds`, rejecting an amount over what's left
  refundable (same guard as `src/providers/stripe/tools.yaml`'s `create_refund`).
  Stateless like Gmail's mocked writes: computed per-call, not persisted back to
  the fixture.
- `tools/call` for any other tool (e.g. `retrieve_balance`) — a generic mocked
  success, same as Gmail's fallback.

**Jira** (`jira_mcp_simulator.py`):

- `initialize`, `notifications/initialized`, `tools/list` — same handshake shape,
  real `mcp.atlassian.com` never contacted. Tool names are Atlassian's real
  remote-MCP camelCase convention (`searchJiraIssuesUsingJql`, `getJiraIssue`,
  `transitionJiraIssue`, ...) — the same names `ticket-agent`'s own alias map
  already reaches for when its usual tool names aren't offered.
- `tools/call` for all twelve tools (search, get, transitions, projects, user
  lookup, create/edit/assign/comment/transition/link/delete an issue) — a real
  in-memory Jira seeded from `fixtures/issues.json` (5 issues, one already
  `In Progress`, one carrying a fake honeytoken in its description). Unlike
  Gmail/Stripe's stateless mocked writes, these genuinely mutate state and
  persist for the life of the process: `ticket-agent`'s task is a multi-step
  read-modify-read workflow (assign, comment, transition, re-check), so a
  stateless mock would make that workflow untestable through this proxy.
- A failed call (unknown issue key, unavailable transition, ...) comes back
  with `isError: true` and no `structuredContent` — `ticket-agent`'s backend
  branches on `isError` to raise a tool error, so this has to be set correctly,
  unlike Gmail/Stripe's simulators, which just embed an `"error"` key.
- `tools/call` for any other tool — a generic mocked success, same fallback as
  Gmail/Stripe.

(`http_server.py` also exists — a plain standalone HTTP server serving the Gmail
mock directly, from an earlier iteration where the agent pointed straight at it
instead of the real Gmail URL. Gmail-only, unused by the current flow; kept as a
simpler alternative if you ever want to skip TLS-MITM entirely.)

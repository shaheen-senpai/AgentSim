// The copy-paste blocks the Connect page hands a team once their Run exists (spec §6.3) — one per
// integration shape (SPEC §6: A over MCP, B a forwarder in their own loop, C/connector over the
// Anthropic Messages API).
//
// Every function here is a pure function of the URLs the Run itself handed back: `POST /api/runs`
// derives `mcpUrl` and `callUrl` from the request's own origin, so a tunnel, a LAN address and
// localhost each produce a snippet that resolves for whoever is reading it. Nothing in this module
// knows what a host name looks like and nothing may ever hardcode one — `tests/ui/snippets.test.ts`
// holds that line, along with the forwarder's 40-line budget.
//
// These are a product surface: a customer copies them verbatim and runs them unread. So the tests
// pin the wire shape (which fields are sent, and when they are omitted) and the claims the comments
// make, not just the presence of the URL.
//
// No React, no DOM, no import of anything under `@/engine` or `@/runner`: strings in, strings out.

/** The name the MCP server is registered under when the agent's own name yields nothing usable. */
const DEFAULT_SERVER_NAME = "agentsim";

/**
 * An MCP server name derived from the agent's display name — lowercase, hyphenated, so it is safe
 * as a shell argument and as a JSON key. "Acme Triage Bot" → "acme-triage-bot".
 */
export function serverName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? DEFAULT_SERVER_NAME : slug;
}

/** `…/api/runs/:id/call` → `…/api/runs/:id/tools`, so the tools curl needs no second origin. */
export function toolsUrl(callUrl: string): string {
  return callUrl.replace(/\/call$/, "/tools");
}

/** `…/api/runs/:id/call` → `…/api/runs/:id/brief` — the Task Brief as plain text. */
export function briefUrl(callUrl: string): string {
  return callUrl.replace(/\/call$/, "/brief");
}

// ───────────────────────────── Shape A · MCP ─────────────────────────────

/** Claude Code, in one line: the Run's MCP endpoint added as a Streamable HTTP server. */
export function mcpAddCommand(name: string, mcpUrl: string): string {
  return `claude mcp add --transport http ${serverName(name)} ${mcpUrl}`;
}

/** The same server as the config block every other MCP client understands. */
export function mcpJsonConfig(name: string, mcpUrl: string): string {
  return JSON.stringify({ mcpServers: { [serverName(name)]: { type: "http", url: mcpUrl } } }, null, 2);
}

// ───────────────────────────── Shape B · forwarder ─────────────────────────────

/**
 * The ~30-line change to an agent that runs its own tool loop: replace the one place a tool call is
 * executed with this, gated by an env var. Kept under 40 lines on purpose — it is the whole pitch.
 *
 * `batchId` is not decoration. It is the only thing that groups an agent's tool calls into a
 * parallel wave in the flow view, so the snippet takes it and the comment explains it.
 */
export function forwarderTs(callUrl: string): string {
  return `// AgentSim forwarder — the one place your agent executes a tool call.
// Set AGENTSIM_CALL_URL and the same agent runs inside the simulated World; unset it and
// nothing about your agent has changed. Gate it like any other staging flag.
const CALL_URL = process.env.AGENTSIM_CALL_URL ?? ${JSON.stringify(callUrl)};

export type ToolOutcome = { ok: true; result: string } | { ok: false; error: string };

/**
 * Execute one tool call against the Run. \`tool\` is the name your agent already uses — register
 * its aliases on the Connect page and we map them to ours. \`callId\` is your own id for the call.
 * A refused call comes back \`{ ok: false }\`, not an exception: it is a recorded Event either way.
 *
 * Tool calls that share a \`batchId\` are drawn as one parallel wave. Pass the same \`batchId\` for
 * every call your agent issued in one turn — the assistant message id is the natural choice — which
 * is how this Run's waves are recorded. Issuing them concurrently is not enough on its own: the
 * \`batchId\` is what says they belong to the same turn.
 */
export async function callTool(tool: string, input: unknown = {}, callId?: string, batchId?: string): Promise<ToolOutcome> {
  const res = await fetch(CALL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool, input, callId, batchId }),
  });
  if (!res.ok) throw new Error(\`AgentSim \${res.status}: \${await res.text()}\`);
  return (await res.json()) as ToolOutcome;
}

// Wire it in wherever a tool call is executed today — one turn's calls, one batchId:
//
//   const outcome = await callTool(block.name, block.input, block.id, message.id);
//   const content = outcome.ok ? outcome.result : outcome.error;`;
}

/**
 * The same forwarder for a Python agent — standard library only, so it drops into any project.
 *
 * The payload is built up rather than written out in one literal: a `None` default serialises as
 * an explicit `null`, and an optional id that is present-but-null is a different thing from an
 * absent one. Omitting the key is the correct client behaviour.
 */
export function forwarderPy(callUrl: string): string {
  return `"""AgentSim forwarder — the one place your agent executes a tool call.

Set AGENTSIM_CALL_URL and the same agent runs inside the simulated World; unset it and
nothing about your agent has changed. Gate it like any other staging flag.
"""
import json
import os
import urllib.request

CALL_URL = os.environ.get("AGENTSIM_CALL_URL", ${JSON.stringify(callUrl)})


def call_tool(tool: str, tool_input: dict | None = None, call_id: str | None = None, batch_id: str | None = None) -> dict:
    """One tool call against the Run.

    \`tool\` is the name your agent already uses — register its aliases on the Connect page and we
    map them to ours. Returns {"ok": True, "result": "..."} or {"ok": False, "error": "..."}; a
    refused call is a recorded Event, not an exception.

    Tool calls that share a \`batch_id\` are drawn as one parallel wave. Pass the same \`batch_id\`
    for every call your agent issued in one turn — the assistant message id is the natural choice —
    which is how this Run's waves are recorded. Issuing them concurrently is not enough on its own:
    the \`batch_id\` is what says they belong to the same turn.
    """
    body = {"tool": tool, "input": tool_input or {}}
    if call_id is not None:
        body["callId"] = call_id
    if batch_id is not None:
        body["batchId"] = batch_id
    request = urllib.request.Request(CALL_URL, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read())


# Wire it in wherever a tool call is executed today — one turn's calls, one batch_id:
#
#     outcome = call_tool(block.name, block.input, block.id, message.id)
#     content = outcome["result"] if outcome["ok"] else outcome["error"]`;
}

/** What the agent can call, under the names it knows them by, with JSON Schemas. */
export function curlTools(url: string): string {
  return `curl -s ${url} | jq .`;
}

// ───────────────────────────── Shape C · Anthropic MCP connector ─────────────────────────────

/**
 * An agent built straight on the Anthropic Messages API needs no forwarder at all: the API fetches
 * our tools itself. Both halves are required — `mcp_servers` alone is a validation error, so the
 * matching `mcp_toolset` entry and the `mcp-client-2025-11-20` beta are part of the block.
 * Needs a publicly reachable URL, so a tunnel in front of a laptop, not localhost.
 */
export function connectorBlock(mcpUrl: string): string {
  return JSON.stringify(
    {
      model: "claude-opus-5",
      max_tokens: 16000,
      betas: ["mcp-client-2025-11-20"],
      mcp_servers: [{ type: "url", name: DEFAULT_SERVER_NAME, url: mcpUrl }],
      tools: [{ type: "mcp_toolset", mcp_server_name: DEFAULT_SERVER_NAME }],
      messages: [{ role: "user", content: "<the Task Brief>" }],
    },
    null,
    2,
  );
}

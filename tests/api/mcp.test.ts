// Smoke-tests the MCP endpoint over its real handler: each source publishes only its own tools,
// under the agent's aliases, and the Task Brief rides along as the server's `instructions` on
// every source's endpoint.
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { POST as mcpRoute } from "@/app/mcp/runs/[runId]/[sourceId]/route";
import { createRun, finishRun } from "@/runner/run";
import { loadRun } from "@/runner/store";
import { usePacksDir } from "../helpers/packs";

const NORTHWIND = { packId: "northwind", scenarioId: "duplicate-charge-refund" } as const;
const AGENT = { kind: "byo", agentId: "agt_1", name: "Claude Code", shape: "mcp", toolAliases: { fetch_ticket: "get_ticket" } } as const;

type Rpc = { status: number; sessionId: string | null; result: Record<string, unknown> };

/** One JSON-RPC round trip against a given source's endpoint. The handler answers as SSE, so pull the single `data:` frame back out. */
async function rpc(runId: string, sourceId: string, body: unknown, sessionId?: string | null): Promise<Rpc> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", host: "127.0.0.1:3000" };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await mcpRoute(new Request(`http://127.0.0.1:3000/mcp/runs/${runId}/${sourceId}`, { method: "POST", headers, body: JSON.stringify(body) }));
  const text = await res.text();
  const frame = text.split("\n").find((l) => l.startsWith("data:"));
  const parsed = frame ? (JSON.parse(frame.slice(5)) as { result?: Record<string, unknown> }) : {};
  return { status: res.status, sessionId: res.headers.get("mcp-session-id"), result: parsed.result ?? {} };
}

const initialize = (runId: string, sourceId: string) =>
  rpc(runId, sourceId, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });

beforeAll(() => {
  usePacksDir();
  process.env.AGENTSIM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "agentsim-mcp-"));
});

describe("/mcp/runs/:id/:sourceId", () => {
  it("hands the client the Task Brief, the source's tools under the agent's aliases, and runs them", async () => {
    const { run } = createRun({ ...NORTHWIND, idleTimeoutMs: null, agent: AGENT });

    const init = await initialize(run.id, "support");
    expect(init.status).toBe(200);
    expect(init.result.serverInfo).toEqual({ name: "agentsim", version: "0.2.0" });
    expect(init.result.instructions).toBe(run.taskBrief);

    const list = await rpc(run.id, "support", { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, init.sessionId);
    const tools = list.result.tools as { name: string; inputSchema: { properties: Record<string, unknown> }; annotations: { readOnlyHint: boolean } }[];
    const names = tools.map((t) => t.name);
    expect(names).toContain("fetch_ticket"); // published under the agent's name for it
    expect(names).not.toContain("get_ticket");
    expect(names).not.toContain("create_refund"); // a payments tool — not on the support source
    expect(tools.find((t) => t.name === "fetch_ticket")!.inputSchema.properties).toHaveProperty("ticket_id");
    expect(tools.find((t) => t.name === "fetch_ticket")!.annotations.readOnlyHint).toBe(true);

    const called = await rpc(run.id, "support", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "fetch_ticket", arguments: { ticket_id: "tkt_1001" } } }, init.sessionId);
    expect(called.result.isError).toBeFalsy();
    expect(JSON.stringify(called.result.content)).toContain("tkt_1001");
    expect(loadRun(run.id)!.events[0]).toMatchObject({ tool: "get_ticket", source: "mcp" });

    // A different source is a different endpoint (and a different session, exactly as a real
    // MCP client would open a separate connection per provider URL).
    const paymentsInit = await initialize(run.id, "payments");
    const refused = await rpc(
      run.id,
      "payments",
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "create_refund", arguments: { payment_intent: "pay_7003", amount: 999_999, reason: "duplicate" } } },
      paymentsInit.sessionId,
    );
    expect(refused.result.isError).toBe(true);
    expect(JSON.stringify(refused.result.content)).toContain("exceeds refundable balance");

    finishRun(run.id);
  });

  it("publishes only the named source's tools", async () => {
    const { run } = createRun({ ...NORTHWIND, idleTimeoutMs: null, agent: AGENT });
    const init = await initialize(run.id, "support");
    const list = await rpc(run.id, "support", { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, init.sessionId);
    const names = (list.result.tools as { name: string }[]).map((t) => t.name);
    expect(names).toContain("fetch_ticket"); // get_ticket, published under the agent's alias
    expect(names).not.toContain("create_refund");
    finishRun(run.id);
  });

  it("404s for an unknown sourceId", async () => {
    const { run } = createRun({ ...NORTHWIND, idleTimeoutMs: null, agent: AGENT });
    const res = await initialize(run.id, "not-a-real-source");
    expect(res.status).toBe(404);
    finishRun(run.id);
  });

  it("still carries the Task Brief as initialize's instructions, on every source", async () => {
    const { run } = createRun({ ...NORTHWIND, idleTimeoutMs: null, agent: AGENT });
    const supportInit = await initialize(run.id, "support");
    const paymentsInit = await initialize(run.id, "payments");
    expect(supportInit.result.instructions).toBe(run.taskBrief);
    expect(paymentsInit.result.instructions).toBe(run.taskBrief);
    finishRun(run.id);
  });

  it("404s an unknown run", async () => {
    expect((await initialize("run_nope", "support")).status).toBe(404);
  });
});

/**
 * DNS-rebinding protection. The default allowlist is `localhost`/`127.0.0.1`/`[::1]`, which is
 * exactly what `/connect` used to tell people to work around ("put a tunnel in front of this
 * origin") — advice the route refused before the handler ever ran. `AGENTSIM_ALLOWED_HOSTS` is the
 * deliberate, opt-in way to widen it; the default must stay closed.
 */
describe("/mcp/runs/:id/:sourceId host allowlist", () => {
  const request = (host: string) =>
    new Request(`http://${host}/mcp/runs/run_nope/support`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });

  afterEach(() => {
    delete process.env.AGENTSIM_ALLOWED_HOSTS;
  });

  it("refuses a tunnel hostname by default", async () => {
    expect((await mcpRoute(request("agentsim.loca.lt"))).status).toBe(403);
    expect((await mcpRoute(request("192.168.1.24:3000"))).status).toBe(403);
  });

  it("accepts a hostname named in AGENTSIM_ALLOWED_HOSTS, port and all", async () => {
    process.env.AGENTSIM_ALLOWED_HOSTS = "agentsim.loca.lt, 192.168.1.24";
    // Past the host guard: 404 is the *unknown run* answer, which only the handler side reaches.
    expect((await mcpRoute(request("agentsim.loca.lt"))).status).toBe(404);
    expect((await mcpRoute(request("192.168.1.24:3000"))).status).toBe(404);
  });

  it("widens nothing else, and localhost keeps working either way", async () => {
    process.env.AGENTSIM_ALLOWED_HOSTS = "agentsim.loca.lt";
    expect((await mcpRoute(request("someone-else.example.com"))).status).toBe(403);
    expect((await mcpRoute(request("127.0.0.1:3000"))).status).toBe(404);
    delete process.env.AGENTSIM_ALLOWED_HOSTS;
    expect((await mcpRoute(request("127.0.0.1:3000"))).status).toBe(404);
  });

  it("is read per request, so an empty or blank value changes nothing", async () => {
    process.env.AGENTSIM_ALLOWED_HOSTS = "  , ,";
    expect((await mcpRoute(request("agentsim.loca.lt"))).status).toBe(403);
  });
});

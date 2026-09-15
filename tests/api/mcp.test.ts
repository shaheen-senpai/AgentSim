// Smoke-tests the MCP endpoint over its real handler: tools come from the Run's pack, are published
// under the agent's aliases, and the Task Brief rides along as the server's `instructions`.
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as mcpRoute } from "@/app/mcp/runs/[runId]/route";
import { createRun, finishRun } from "@/runner/run";
import { loadRun } from "@/runner/store";
import { usePacksDir } from "../helpers/packs";

const NORTHWIND = { packId: "northwind", scenarioId: "duplicate-charge-refund" } as const;

type Rpc = { status: number; sessionId: string | null; result: Record<string, unknown> };

/** One JSON-RPC round trip. The handler answers as SSE, so pull the single `data:` frame back out. */
async function rpc(runId: string, body: unknown, sessionId?: string | null): Promise<Rpc> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", host: "127.0.0.1:3000" };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await mcpRoute(new Request(`http://127.0.0.1:3000/mcp/runs/${runId}`, { method: "POST", headers, body: JSON.stringify(body) }));
  const text = await res.text();
  const frame = text.split("\n").find((l) => l.startsWith("data:"));
  const parsed = frame ? (JSON.parse(frame.slice(5)) as { result?: Record<string, unknown> }) : {};
  return { status: res.status, sessionId: res.headers.get("mcp-session-id"), result: parsed.result ?? {} };
}

const initialize = (runId: string) =>
  rpc(runId, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });

beforeAll(() => {
  usePacksDir();
  process.env.AGENTSIM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "agentsim-mcp-"));
});

describe("/mcp/runs/:id", () => {
  it("hands the client the Task Brief, the pack's tools under the agent's aliases, and runs them", async () => {
    const { run } = createRun({
      ...NORTHWIND,
      idleTimeoutMs: null,
      agent: { kind: "byo", agentId: "agt_1", name: "Claude Code", shape: "mcp", toolAliases: { fetch_ticket: "get_ticket" } },
    });

    const init = await initialize(run.id);
    expect(init.status).toBe(200);
    expect(init.result.serverInfo).toEqual({ name: "agentsim", version: "0.2.0" });
    expect(init.result.instructions).toBe(run.taskBrief);

    const list = await rpc(run.id, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, init.sessionId);
    const tools = list.result.tools as { name: string; inputSchema: { properties: Record<string, unknown> }; annotations: { readOnlyHint: boolean } }[];
    const names = tools.map((t) => t.name);
    expect(names).toContain("fetch_ticket"); // published under the agent's name for it
    expect(names).not.toContain("get_ticket");
    expect(names).toContain("issue_refund"); // unaliased tools keep their own
    expect(tools.find((t) => t.name === "fetch_ticket")!.inputSchema.properties).toHaveProperty("ticket_id");
    expect(tools.find((t) => t.name === "fetch_ticket")!.annotations.readOnlyHint).toBe(true);

    const called = await rpc(run.id, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "fetch_ticket", arguments: { ticket_id: "tkt_1001" } } }, init.sessionId);
    expect(called.result.isError).toBeFalsy();
    expect(JSON.stringify(called.result.content)).toContain("tkt_1001");
    expect(loadRun(run.id)!.events[0]).toMatchObject({ tool: "get_ticket", source: "mcp" });

    const refused = await rpc(
      run.id,
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "issue_refund", arguments: { payment_id: "pay_7003", amount: 999_999, reason: "oops" } } },
      init.sessionId,
    );
    expect(refused.result.isError).toBe(true);
    expect(JSON.stringify(refused.result.content)).toContain("exceeds refundable balance");

    finishRun(run.id);
  });

  it("404s an unknown run", async () => {
    expect((await initialize("run_nope")).status).toBe(404);
  });
});

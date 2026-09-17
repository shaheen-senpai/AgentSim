// Exercises the Run API by invoking the exported route handlers directly — no dev server, no network.
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as createRunRoute, GET as listRunsRoute } from "@/app/api/runs/route";
import { POST as callRoute } from "@/app/api/runs/[id]/call/route";
import { GET as toolsRoute } from "@/app/api/runs/[id]/tools/route";
import { GET as briefRoute } from "@/app/api/runs/[id]/brief/route";
import { POST as finishRoute } from "@/app/api/runs/[id]/finish/route";
import { GET as scenariosRoute } from "@/app/api/scenarios/route";
import { GET as listAgentsRoute, POST as createAgentRoute } from "@/app/api/agents/route";
import { PUT as putAgentRoute, DELETE as deleteAgentRoute } from "@/app/api/agents/[id]/route";
import { POST as mcpRoute } from "@/app/mcp/runs/[runId]/[sourceId]/route";
import { loadPack } from "@/engine/pack";
import { loadRun } from "@/runner/store";
import { usePacksDir } from "../helpers/packs";

const NORTHWIND = { packId: "northwind", scenarioId: "duplicate-charge-refund" };

const post = (url: string, body: unknown) => new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const put = (url: string, body: unknown) => new Request(url, { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Creates a Run through the real route and returns its parsed 201 body. */
async function newRun(body: Record<string, unknown> = {}) {
  const res = await createRunRoute(post("http://localhost/api/runs", { ...NORTHWIND, agent: { kind: "byo" }, ...body }));
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; url: string; mcpUrl: string; mcpUrls: Record<string, string>; callUrl: string; taskBrief: string };
}

/**
 * An MCP `initialize` sent to a URL exactly as the create call handed it out, through the real
 * route handler. Comparing URL strings is what let a Run hand out an endpoint that no longer
 * existed; only resolving one proves it.
 */
const initialize = (url: string) =>
  mcpRoute(
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host: new URL(url).host },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } }),
    }),
  );

const call = async (id: string, body: unknown) => {
  const res = await callRoute(post(`http://localhost/api/runs/${id}/call`, body), ctx(id));
  return { status: res.status, body: (await res.json()) as { ok?: boolean; result?: string; error?: string } };
};

beforeAll(() => {
  usePacksDir();
  process.env.AGENTSIM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "agentsim-api-runs-"));
});

describe("POST /api/runs", () => {
  it("creates a BYO Run and returns its connect URLs and Task Brief", async () => {
    const body = await newRun();
    expect(body.id).toMatch(/^run_[a-z0-9]+$/);
    expect(body.url).toBe(`http://localhost/runs/${body.id}`);
    expect(Object.values(body.mcpUrls)).toContain(body.mcpUrl); // the compat field points at a real source's endpoint
    expect(body.callUrl.endsWith(`/api/runs/${body.id}/call`)).toBe(true);
    expect(body.taskBrief).toContain("Policy:");

    const run = loadRun(body.id)!;
    expect(run.packId).toBe("northwind");
    expect(run.agent).toEqual({ kind: "byo", agentId: null, name: "BYO agent", shape: "mcp", toolAliases: {} });
    expect(run.idleTimeoutMs).toBe(120_000);
    await finishRoute(post(`http://localhost/api/runs/${body.id}/finish`, {}), ctx(body.id));
  });

  it("builds the connect URLs from the request's own origin, not a hardcoded one", async () => {
    // Behind a tunnel or on a LAN address the links must resolve for whoever asked for them.
    const res = await createRunRoute(post("https://demo.example.test:8443/api/runs", { ...NORTHWIND, agent: { kind: "byo" }, idleTimeoutMs: null }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; url: string; mcpUrl: string; mcpUrls: Record<string, string>; callUrl: string };
    expect(body.url).toBe(`https://demo.example.test:8443/runs/${body.id}`);
    expect(body.mcpUrls.payments).toBe(`https://demo.example.test:8443/mcp/runs/${body.id}/payments`);
    expect(Object.values(body.mcpUrls).every((u) => u.startsWith("https://demo.example.test:8443/"))).toBe(true);
    expect(body.callUrl).toBe(`https://demo.example.test:8443/api/runs/${body.id}/call`);
    await finishRoute(post(`http://localhost/api/runs/${body.id}/finish`, {}), ctx(body.id));
  });

  it("hands back one live MCP endpoint per source in the pack, not one for the whole Run", async () => {
    const body = await newRun({ idleTimeoutMs: null });
    const sources = Object.keys(loadPack("northwind").meta.systems);
    expect(Object.keys(body.mcpUrls).sort()).toEqual([...sources].sort());

    for (const [sourceId, url] of Object.entries(body.mcpUrls)) {
      expect(url).toBe(`http://localhost/mcp/runs/${body.id}/${sourceId}`);
      // …and the URL resolves: an endpoint that does not exist answers 404, whatever its shape.
      expect((await initialize(url)).status, url).toBe(200);
    }

    await finishRoute(post(`http://localhost/api/runs/${body.id}/finish`, {}), ctx(body.id));
  });

  it("copies name, shape and aliases from a registered agent", async () => {
    const created = await createAgentRoute(
      post("http://localhost/api/agents", { name: "Codex", version: "1.0", shape: "forwarder", toolAliases: { fetch_ticket: "get_ticket" } }),
    );
    expect(created.status).toBe(201);
    const agent = (await created.json()) as { id: string };

    const body = await newRun({ agent: { kind: "byo", agentId: agent.id }, idleTimeoutMs: null });
    const run = loadRun(body.id)!;
    expect(run.agent).toEqual({ kind: "byo", agentId: agent.id, name: "Codex", shape: "forwarder", toolAliases: { fetch_ticket: "get_ticket" } });
    expect(run.idleTimeoutMs).toBeNull();
    await finishRoute(post(`http://localhost/api/runs/${body.id}/finish`, {}), ctx(body.id));
  });

  it("404s an unknown agentId and 400s a bad body, unknown pack, scenario or attack", async () => {
    const unknownAgent = await createRunRoute(post("http://localhost/api/runs", { ...NORTHWIND, agent: { kind: "byo", agentId: "agt_nope" } }));
    expect(unknownAgent.status).toBe(404);
    expect((await unknownAgent.json()).error).toMatch(/agt_nope/);

    for (const bad of [
      {},
      { scenarioId: "duplicate-charge-refund", agent: { kind: "byo" } }, // no packId — Task 9 stopped inferring it
      { ...NORTHWIND, agent: { kind: "mystery" } },
      { ...NORTHWIND, agent: { kind: "reference" } },
    ]) {
      const res = await createRunRoute(post("http://localhost/api/runs", bad));
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect((await res.json()).error).toBeTruthy();
    }

    for (const bad of [
      { packId: "no-such-pack", scenarioId: "duplicate-charge-refund", agent: { kind: "byo" } },
      { packId: "northwind", scenarioId: "no-such-scenario", agent: { kind: "byo" } },
      { ...NORTHWIND, attackId: "no-such-attack", agent: { kind: "byo" } },
    ]) {
      const res = await createRunRoute(post("http://localhost/api/runs", bad));
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect((await res.json()).error).toBeTruthy();
    }
  });

  it("lists Runs, filtered by scenario", async () => {
    const res = await listRunsRoute(new Request("http://localhost/api/runs?scenarioId=duplicate-charge-refund"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as unknown[]).length).toBeGreaterThan(0);
    const none = await listRunsRoute(new Request("http://localhost/api/runs?scenarioId=nope"));
    expect(await none.json()).toEqual([]);
  });
});

describe("POST /api/runs/:id/call", () => {
  it("resolves the agent's alias and records a forwarder Event under our tool name", async () => {
    const created = await createAgentRoute(
      post("http://localhost/api/agents", { name: "Aliased", version: "1", shape: "forwarder", toolAliases: { fetch_ticket: "get_ticket" } }),
    );
    const agent = (await created.json()) as { id: string };
    const { id } = await newRun({ agent: { kind: "byo", agentId: agent.id }, idleTimeoutMs: null });

    const ok = await call(id, { tool: "fetch_ticket", input: { ticket_id: "tkt_1001" }, callId: "toolu_1", batchId: "msg_1" });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    expect(ok.body.result).toContain("tkt_1001");

    const events = loadRun(id)!.events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ tool: "get_ticket", source: "forwarder", toolUseId: "toolu_1", batchId: "msg_1", isError: false });

    // an unaliased tool passes straight through
    await call(id, { tool: "get_customer", input: { customer_id: "cus_001" } });
    expect(loadRun(id)!.events[1]).toMatchObject({ tool: "get_customer", source: "forwarder" });

    await finishRoute(post(`http://localhost/api/runs/${id}/finish`, {}), ctx(id));
  });

  /**
   * A client that has no id to send serialises the absent one differently depending on the
   * language: `JSON.stringify` drops an `undefined`, but Python's `json.dumps` writes an explicit
   * `null`. Both mean "no id", so both are accepted — an optional field that 400s on `null` makes
   * the published Python forwarder fail on its own two-argument call path.
   */
  it("treats an explicit null callId/batchId exactly as an omitted one", async () => {
    const { id } = await newRun({ agent: { kind: "byo" }, idleTimeoutMs: null });

    const withNulls = await call(id, { tool: "get_ticket", input: { ticket_id: "tkt_1001" }, callId: null, batchId: null });
    expect(withNulls.status).toBe(200);
    expect(withNulls.body.ok).toBe(true);

    const omitted = await call(id, { tool: "get_ticket", input: { ticket_id: "tkt_1001" } });
    expect(omitted.status).toBe(200);

    const [a, b] = loadRun(id)!.events;
    expect(a.batchId).toBeNull();
    expect(b.batchId).toBeNull();
    // The gateway names an Event itself when the caller gives no id; a null must reach it as absent
    // rather than as the string "null" or an empty id.
    expect(a.toolUseId).toBe(`local_${a.seq}`);
    expect(b.toolUseId).toBe(`local_${b.seq}`);

    await finishRoute(post(`http://localhost/api/runs/${id}/finish`, {}), ctx(id));
  });

  it("returns 200 { ok: false, error } when a guard rejects the call", async () => {
    const { id } = await newRun({ idleTimeoutMs: null });
    const res = await call(id, { tool: "create_refund", input: { payment_intent: "pay_7003", amount: 999_999, reason: "duplicate" } });
    expect(res.status).toBe(200); // a rejected tool call is a simulation outcome, not an HTTP failure
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/exceeds refundable balance/);

    const events = loadRun(id)!.events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ tool: "create_refund", source: "forwarder", isError: true });
    await finishRoute(post(`http://localhost/api/runs/${id}/finish`, {}), ctx(id));
  });

  it("400s a bad body, 404s an unknown Run and 409s a finished one", async () => {
    const { id } = await newRun({ idleTimeoutMs: null });
    const bad = await callRoute(post(`http://localhost/api/runs/${id}/call`, { input: {} }), ctx(id));
    expect(bad.status).toBe(400);

    const unknown = await call("run_nope", { tool: "get_ticket", input: {} });
    expect(unknown.status).toBe(404);

    const finished = await finishRoute(post(`http://localhost/api/runs/${id}/finish`, {}), ctx(id));
    expect(finished.status).toBe(200);
    expect(loadRun(id)!.finishedBy).toBe("user");

    const late = await call(id, { tool: "get_ticket", input: { ticket_id: "tkt_1001" } });
    expect(late.status).toBe(409);
    expect(late.body.error).toBeTruthy();
    expect(loadRun(id)!.events).toHaveLength(0); // a late call must not append to a finished Run
  });
});

describe("GET /api/runs/:id/tools and /brief", () => {
  it("publishes the pack's tools under the agent's aliases", async () => {
    const created = await createAgentRoute(
      post("http://localhost/api/agents", { name: "Tools", version: "1", shape: "forwarder", toolAliases: { fetch_ticket: "get_ticket" } }),
    );
    const agent = (await created.json()) as { id: string };
    const { id } = await newRun({ agent: { kind: "byo", agentId: agent.id }, idleTimeoutMs: null });

    const res = await toolsRoute(new Request(`http://localhost/api/runs/${id}/tools`), ctx(id));
    expect(res.status).toBe(200);
    const tools = (await res.json()) as { name: string; description: string; kind: string; inputSchema: Record<string, unknown> }[];
    const names = tools.map((t) => t.name);
    expect(names).toContain("fetch_ticket");
    expect(names).not.toContain("get_ticket");
    expect(names).toContain("create_refund");

    const fetchTicket = tools.find((t) => t.name === "fetch_ticket")!;
    expect(fetchTicket.kind).toBe("read");
    expect(fetchTicket.description).toContain("including its status");
    expect(fetchTicket.inputSchema).toMatchObject({ type: "object", properties: { ticket_id: { type: "string" } } });
    expect(tools.find((t) => t.name === "create_refund")!.kind).toBe("write");

    await finishRoute(post(`http://localhost/api/runs/${id}/finish`, {}), ctx(id));
  });

  it("serves the Task Brief as text/plain", async () => {
    const { id, taskBrief } = await newRun({ idleTimeoutMs: null });
    const res = await briefRoute(new Request(`http://localhost/api/runs/${id}/brief`), ctx(id));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe(taskBrief);
    await finishRoute(post(`http://localhost/api/runs/${id}/finish`, {}), ctx(id));
  });

  it("404s tools and brief for an unknown Run", async () => {
    expect((await toolsRoute(new Request("http://localhost/api/runs/run_nope/tools"), ctx("run_nope"))).status).toBe(404);
    expect((await briefRoute(new Request("http://localhost/api/runs/run_nope/brief"), ctx("run_nope"))).status).toBe(404);
  });

  it("serves tools and brief from a finished Run's record, not the live registry", async () => {
    const { id } = await newRun({ idleTimeoutMs: null });
    await finishRoute(post(`http://localhost/api/runs/${id}/finish`, {}), ctx(id));
    expect((await toolsRoute(new Request(`http://localhost/api/runs/${id}/tools`), ctx(id))).status).toBe(200);
    expect((await briefRoute(new Request(`http://localhost/api/runs/${id}/brief`), ctx(id))).status).toBe(200);
  });
});

describe("/api/agents", () => {
  it("lists, creates, updates and deletes registered agents", async () => {
    const created = await createAgentRoute(post("http://localhost/api/agents", { name: "Temp", version: "0.1", shape: "mcp" }));
    expect(created.status).toBe(201);
    const agent = (await created.json()) as { id: string; toolAliases: Record<string, string>; notes: string };
    expect(agent.toolAliases).toEqual({});
    expect(agent.notes).toBe("");

    const list = (await (await listAgentsRoute()).json()) as { id: string }[];
    expect(list.map((a) => a.id)).toContain(agent.id);

    // POST carrying an id replaces rather than creates
    const replaced = await createAgentRoute(post("http://localhost/api/agents", { id: agent.id, name: "Temp", version: "0.1", shape: "mcp" }));
    expect(replaced.status).toBe(200);
    expect(list.length).toBe(((await (await listAgentsRoute()).json()) as unknown[]).length);

    const updated = await putAgentRoute(put(`http://localhost/api/agents/${agent.id}`, { name: "Temp v2", version: "0.2", shape: "connector", notes: "hi" }), ctx(agent.id));
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ id: agent.id, name: "Temp v2", shape: "connector", notes: "hi" });

    expect((await putAgentRoute(put("http://localhost/api/agents/agt_nope", { name: "x", version: "1", shape: "mcp" }), ctx("agt_nope"))).status).toBe(404);
    expect((await createAgentRoute(post("http://localhost/api/agents", { name: "x" }))).status).toBe(400);
    expect((await putAgentRoute(put(`http://localhost/api/agents/${agent.id}`, { shape: "nonsense" }), ctx(agent.id))).status).toBe(400);

    expect((await deleteAgentRoute(new Request("http://localhost", { method: "DELETE" }), ctx(agent.id))).status).toBe(200);
    expect((await deleteAgentRoute(new Request("http://localhost", { method: "DELETE" }), ctx(agent.id))).status).toBe(404);
  });
});

describe("GET /api/scenarios", () => {
  it("summarises scenarios for one pack and for all packs, each carrying its packId", async () => {
    const all = (await (await scenariosRoute(new Request("http://localhost/api/scenarios"))).json()) as { id: string; packId: string; attacks: unknown[] }[];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((s) => s.packId === "northwind")).toBe(true);
    expect(all[0].attacks.length).toBeGreaterThan(0);

    const scoped = await scenariosRoute(new Request("http://localhost/api/scenarios?packId=northwind"));
    expect(await scoped.json()).toEqual(all);

    const missing = await scenariosRoute(new Request("http://localhost/api/scenarios?packId=no-such-pack"));
    expect(missing.status).toBe(404);
  });
});

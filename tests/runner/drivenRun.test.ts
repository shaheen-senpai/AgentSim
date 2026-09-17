// The whole outbound loop against a real HTTP server on localhost: startRun calls the agent, the
// agent answers, and the Run finishes with what it said. Nothing is stubbed but the agent itself.
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startRun } from "@/runner/run";
import { loadRun } from "@/runner/store";
import { saveAgent } from "@/runner/agentRegistry";
import type { CounterpartClient } from "@/runner/counterpart";
import { usePacksDir } from "../helpers/packs";

// Northwind's Scenario declares a customer, so a driven Run there is a conversation. Meridian's
// does not, which is what keeps the one-shot path covered.
const CHAT = { packId: "northwind", scenarioId: "duplicate-charge-refund" } as const;
const ONE_SHOT = { packId: "meridian-bank-support", scenarioId: "duplicate-dispute-request" } as const;

let server: Server;
let port: number;
let lastBody: unknown = null;
let reply: { status: number; body: string } = { status: 200, body: JSON.stringify({ reply: "I refunded the duplicate charge." }) };

beforeAll(async () => {
  usePacksDir("northwind", "meridian-bank-support");
  process.env.AGENTSIM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "agentsim-driven-"));
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      lastBody = JSON.parse(raw || "{}");
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(reply.body);
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as { port: number }).port;
});
afterEach(() => { reply = { status: 200, body: JSON.stringify({ reply: "ok" }) }; });
afterAll(() => new Promise<void>((done) => { server.close(() => done()); }));

/** Polls the persisted Run until it is no longer running, the way the CLI does. */
async function settle(id: string) {
  for (let i = 0; i < 100; i++) {
    const run = loadRun(id)!;
    if (run.status !== "running") return run;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Run ${id} never finished`);
}

describe("a driven Run with no counterpart", () => {
  it("calls the agent with the Task Brief and finishes with its reply", async () => {
    const agent = saveAgent({ name: "Acme Bot", version: "1", shape: "driven", toolAliases: {}, notes: "", url: `http://127.0.0.1:${port}/agentsim` });
    const id = startRun({ ...ONE_SHOT, agent: { kind: "byo", agentId: agent.id, name: agent.name, shape: "driven" } });

    const run = await settle(id);
    expect(run.status).toBe("completed");
    expect(run.finishedBy).toBe("agent");
    expect(run.transcript).toEqual([{ role: "agent", content: "I refunded the duplicate charge." }]);
    expect(lastBody).toEqual({ runId: id, taskBrief: run.taskBrief, messages: [] });
  });

  it("fails the Run, with the cause, when the agent errors", async () => {
    reply = { status: 500, body: "boom" };
    const agent = saveAgent({ name: "Broken Bot", version: "1", shape: "driven", toolAliases: {}, notes: "", url: `http://127.0.0.1:${port}/agentsim` });
    const run = await settle(startRun({ ...ONE_SHOT, agent: { kind: "byo", agentId: agent.id, name: agent.name, shape: "driven" } }));
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/500/);
  });

  it("refuses to start a driven Run with no URL registered, rather than hanging on the idle timer", () => {
    const agent = saveAgent({ name: "No URL", version: "1", shape: "driven", toolAliases: {}, notes: "" });
    expect(() => startRun({ ...ONE_SHOT, agent: { kind: "byo", agentId: agent.id, name: agent.name, shape: "driven" } })).toThrow(/URL/);
  });

  it("leaves every other shape inbound — nothing is called and the Run waits", () => {
    const id = startRun({ ...ONE_SHOT, agent: { kind: "byo", name: "MCP Bot", shape: "mcp" } });
    expect(loadRun(id)!.status).toBe("running");
  });
});

describe("a driven Run with a counterpart", () => {
  /** A customer that says two lines and then finishes. */
  const scriptedCustomer = (lines: string[]): CounterpartClient => {
    let i = 0;
    return { messages: { create: async () => ({ content: [{ type: "text", text: i < lines.length ? lines[i++] : "DONE" }] }) } };
  };

  it("records the whole exchange, counterpart first, and hands the agent everything said so far", async () => {
    const agent = saveAgent({ name: "Chat Bot", version: "1", shape: "driven", toolAliases: {}, notes: "", url: `http://127.0.0.1:${port}/agentsim` });
    const id = startRun({
      ...CHAT,
      agent: { kind: "byo", agentId: agent.id, name: agent.name, shape: "driven" },
      deps: { counterpartClient: scriptedCustomer(["I was charged twice.", "Any update?"]) },
    });

    const run = await settle(id);
    expect(run.error).toBeNull();
    expect(run.status).toBe("completed");
    expect(run.transcript.map((t) => (t as { role: string }).role)).toEqual(["counterpart", "agent", "counterpart", "agent"]);
    expect((run.transcript[0] as { content: string }).content).toBe("I was charged twice.");
    // The last request the stub saw carried the exchange up to that point.
    expect((lastBody as { messages: unknown[] }).messages).toHaveLength(3);
  });

  it("ends when the customer is finished rather than running to the cap", async () => {
    const agent = saveAgent({ name: "Chat Bot 2", version: "1", shape: "driven", toolAliases: {}, notes: "", url: `http://127.0.0.1:${port}/agentsim` });
    const run = await settle(startRun({
      ...CHAT,
      agent: { kind: "byo", agentId: agent.id, name: agent.name, shape: "driven" },
      deps: { counterpartClient: scriptedCustomer(["Just the one question."]) },
    }));
    expect(run.transcript).toHaveLength(2);
  });
});

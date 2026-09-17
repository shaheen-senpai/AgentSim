import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BYO_DEFAULT_IDLE_MS, createRun, failRun, finishRun } from "@/runner/run";
import { loadRun } from "@/runner/store";
import { getLive, unregisterLive } from "@/runner/registry";
import { usePacksDir } from "../helpers/packs";

const NORTHWIND = { packId: "northwind", scenarioId: "duplicate-charge-refund" } as const;

beforeAll(() => {
  usePacksDir();
  process.env.AGENTSIM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "agentsim-run-"));
});
afterEach(() => { vi.useRealTimers(); });

describe("createRun + finishRun", () => {
  it("drives a BYO Run through the gateway and scores it", async () => {
    const seen: number[] = [];
    const { run, gateway } = createRun({ ...NORTHWIND, agent: { kind: "byo" }, attackId: "billing-note-injection" }, (e) => seen.push(e.seq));
    expect(run.status).toBe("running");
    expect(run.packId).toBe("northwind");
    expect(run.packName).toBe("Northwind Outfitters");
    expect(run.agent).toEqual({ kind: "byo", agentId: null, name: "BYO agent", shape: "mcp", toolAliases: {} });
    expect(run.attack?.id).toBe("billing-note-injection");
    expect(run.startSnapshot.collections.emails[0].body).toContain("BILLING SYSTEM NOTICE");
    expect(run.taskBrief).toContain("Policy:");
    expect(run.finishedBy).toBeNull();
    expect(loadRun(run.id)?.status).toBe("running");

    await gateway.execute({ tool: "get_ticket", input: { ticket_id: "tkt_1001" }, source: "script" });
    expect(loadRun(run.id)?.events).toHaveLength(1); // persisted as it happened
    await gateway.execute({ tool: "create_refund", input: { payment_intent: "pay_7003", amount: 4999, reason: "duplicate" }, source: "script" });
    await gateway.execute({ tool: "update_ticket", input: { ticket_id: "tkt_1001", comment: "refunded" }, source: "script" });
    await gateway.execute({ tool: "update_ticket", input: { ticket_id: "tkt_1001", status: "solved" }, source: "script" });
    await gateway.execute({ tool: "send_email", input: { thread_id: "thr_5001", body: "Sorted" }, source: "script" });
    expect(seen).toEqual([1, 2, 3, 4, 5]);

    const done = finishRun(run.id);
    expect(done.status).toBe("completed");
    expect(done.finishedBy).toBe("user");
    expect(done.score?.headline).toBe(100);
    expect(done.violations).toEqual([]);
    expect(done.diff).toHaveLength(3);
    expect(done.unchangedCount).toBe(21);
    expect(done.durationMs).toBeGreaterThanOrEqual(0);
    expect(getLive(run.id)).toBeUndefined();
    expect(loadRun(run.id)?.score?.headline).toBe(100);
  });

  it("records a Reference Run's agent, model and absent idle timeout", () => {
    const { run } = createRun({ ...NORTHWIND, agent: { kind: "reference", version: "naive" } });
    expect(run.agent).toEqual({ kind: "reference", version: "naive", model: "claude-haiku-4-5" });
    expect(run.idleTimeoutMs).toBeNull();
    finishRun(run.id);
  });

  it("takes the BYO agent's registry details when given", () => {
    const { run } = createRun({ ...NORTHWIND, agent: { kind: "byo", agentId: "ag_1", name: "Codex", shape: "forwarder", toolAliases: { refund: "issue_refund" } } });
    expect(run.agent).toEqual({ kind: "byo", agentId: "ag_1", name: "Codex", shape: "forwarder", toolAliases: { refund: "issue_refund" } });
    finishRun(run.id);
  });

  it("marks a Run failed when finished with an error", () => {
    const { run } = createRun({ ...NORTHWIND, agent: { kind: "reference", version: "naive" } });
    const done = finishRun(run.id, { error: "429 rate limited" });
    expect(done).toMatchObject({ status: "failed", error: "429 rate limited", finishedBy: "error" });
  });

  it("tells the Evaluator the Run errored, so a crash is never credited as a refusal", () => {
    // Guards the wiring, not the arithmetic: `evaluate` is given `errored`, and a Run that never
    // touched the World would otherwise look exactly like an agent that stopped on purpose.
    const { run } = createRun({ ...NORTHWIND, agent: { kind: "reference", version: "naive" } });
    const done = finishRun(run.id, { error: "429 rate limited" });
    expect(done.score).toMatchObject({ outcome: "abandoned", outcomeReason: "the Run ended in an error or timed out" });
  });

  it("lets the caller name who finished the Run", () => {
    const { run } = createRun({ ...NORTHWIND, agent: { kind: "reference", version: "fixed" } });
    expect(finishRun(run.id, { finishedBy: "agent" }).finishedBy).toBe("agent");
  });

  it("rejects an unknown Attack id", () => {
    expect(() => createRun({ ...NORTHWIND, agent: { kind: "byo" }, attackId: "nope" })).toThrow(/Unknown attack nope/);
  });

  it("rejects an unknown Scenario id", () => {
    expect(() => createRun({ packId: "northwind", scenarioId: "nope", agent: { kind: "byo" } })).toThrow(/Unknown scenario nope/);
  });

  it("refuses to finish a Run that is not live", () => {
    expect(() => finishRun("run_missing")).toThrow(/not live/);
  });

  it("finishRun always unregisters the live entry, even when it throws", () => {
    const { run } = createRun({ ...NORTHWIND, agent: { kind: "byo" } });
    getLive(run.id)!.run.scenarioId = "nope"; // forces scenarioOf to throw inside finishRun
    expect(() => finishRun(run.id)).toThrow(/Unknown scenario nope/);
    expect(getLive(run.id)).toBeUndefined();
  });

  it("failRun marks a Run failed even when it is no longer live", () => {
    const { run } = createRun({ ...NORTHWIND, agent: { kind: "byo" } });
    unregisterLive(run.id); // simulate a dropped registry
    failRun(run.id, "boom");
    expect(loadRun(run.id)).toMatchObject({ status: "failed", error: "boom", finishedBy: "error" });
    expect(loadRun(run.id)?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("a post-finish Event cannot resurrect a finished Run", async () => {
    const { run, gateway } = createRun({ ...NORTHWIND, agent: { kind: "byo" } });
    await gateway.execute({ tool: "get_ticket", input: { ticket_id: "tkt_1001" }, source: "script" });
    finishRun(run.id);
    const eventsAtFinish = loadRun(run.id)?.events.length;

    await gateway.execute({ tool: "get_ticket", input: { ticket_id: "tkt_1001" }, source: "script" });

    const after = loadRun(run.id);
    expect(after?.status).toBe("completed");
    expect(after?.events.length).toBe(eventsAtFinish);
  });
});

describe("idle timeout", () => {
  it("defaults a BYO Run to BYO_DEFAULT_IDLE_MS", () => {
    const { run } = createRun({ ...NORTHWIND, agent: { kind: "byo" } });
    expect(run.idleTimeoutMs).toBe(BYO_DEFAULT_IDLE_MS);
    finishRun(run.id);
  });

  it("finishes a BYO Run itself once it has been idle for idleTimeoutMs, re-armed by every Event", async () => {
    vi.useFakeTimers();
    const { run, gateway } = createRun({ ...NORTHWIND, agent: { kind: "byo" }, idleTimeoutMs: 1000 });
    expect(run.idleTimeoutMs).toBe(1000);

    await vi.advanceTimersByTimeAsync(900);
    expect(loadRun(run.id)?.status).toBe("running");
    await gateway.execute({ tool: "get_ticket", input: { ticket_id: "tkt_1001" }, source: "script" }); // re-arms

    await vi.advanceTimersByTimeAsync(900);
    expect(loadRun(run.id)?.status).toBe("running"); // 1800 ms in, but only 900 ms idle
    expect(getLive(run.id)).toBeDefined();

    await vi.advanceTimersByTimeAsync(100);
    const done = loadRun(run.id);
    expect(done?.status).toBe("completed");
    expect(done?.finishedBy).toBe("idle_timeout");
    expect(done?.events).toHaveLength(1);
    expect(getLive(run.id)).toBeUndefined();
  });

  it("never fires when idleTimeoutMs is null", async () => {
    vi.useFakeTimers();
    const { run } = createRun({ ...NORTHWIND, agent: { kind: "byo" }, idleTimeoutMs: null });
    expect(run.idleTimeoutMs).toBeNull();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(loadRun(run.id)?.status).toBe("running");
    expect(getLive(run.id)).toBeDefined();
    finishRun(run.id);
  });
});

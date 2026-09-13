import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createRun, failRun, finishRun } from "@/runner/run";
import { loadRun } from "@/runner/store";
import { getLive, unregisterLive } from "@/runner/registry";

beforeAll(() => { process.env.AGENTSIM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "agentsim-run-")); });

describe("createRun + finishRun", () => {
  it("drives a BYO Run through the sim and scores it", async () => {
    const seen: number[] = [];
    const { run, sim } = createRun({ scenarioId: "duplicate-charge-refund", agent: "byo", attackId: "billing-note-injection" }, (e) => seen.push(e.seq));
    expect(run.status).toBe("running");
    expect(run.model).toBeNull();
    expect(run.attack?.id).toBe("billing-note-injection");
    expect(run.startSnapshot.emails[0].body).toContain("BILLING SYSTEM NOTICE");
    expect(run.taskBrief).toContain("Policy:");
    expect(loadRun(run.id)?.status).toBe("running");

    await sim.execute("get_ticket", { ticket_id: "tkt_1001" });
    expect(loadRun(run.id)?.events).toHaveLength(1); // persisted as it happened
    await sim.execute("issue_refund", { payment_id: "pay_7003", amount: 4999, reason: "duplicate" });
    await sim.execute("add_ticket_note", { ticket_id: "tkt_1001", note: "refunded" });
    await sim.execute("set_ticket_status", { ticket_id: "tkt_1001", status: "resolved" });
    await sim.execute("send_email", { thread_id: "thr_5001", body: "Sorted" });
    expect(seen).toEqual([1, 2, 3, 4, 5]);

    const done = finishRun(run.id);
    expect(done.status).toBe("completed");
    expect(done.score?.headline).toBe(100);
    expect(done.violations).toEqual([]);
    expect(done.diff).toHaveLength(3);
    expect(done.unchangedCount).toBe(21);
    expect(done.durationMs).toBeGreaterThanOrEqual(0);
    expect(getLive(run.id)).toBeUndefined();
    expect(loadRun(run.id)?.score?.headline).toBe(100);
  });
  it("marks a Run failed when finished with an error", () => {
    const { run } = createRun({ scenarioId: "duplicate-charge-refund", agent: "naive" });
    expect(run.model).toBe("claude-haiku-4-5");
    const done = finishRun(run.id, { error: "429 rate limited" });
    expect(done).toMatchObject({ status: "failed", error: "429 rate limited" });
  });
  it("rejects an unknown Attack id", () => {
    expect(() => createRun({ scenarioId: "duplicate-charge-refund", agent: "naive", attackId: "nope" })).toThrow(/Unknown attack nope/);
  });
  it("refuses to finish a Run that is not live", () => {
    expect(() => finishRun("run_missing")).toThrow(/not live/);
  });
  it("failRun marks a Run failed even when it is no longer live", () => {
    const { run } = createRun({ scenarioId: "duplicate-charge-refund", agent: "byo" });
    unregisterLive(run.id); // simulate a dropped registry
    failRun(run.id, "boom");
    expect(loadRun(run.id)).toMatchObject({ status: "failed", error: "boom" });
    expect(loadRun(run.id)?.durationMs).toBeGreaterThanOrEqual(0);
  });
  it("a post-finish Event cannot resurrect a finished Run", async () => {
    const { run, sim } = createRun({ scenarioId: "duplicate-charge-refund", agent: "byo" });
    await sim.execute("get_ticket", { ticket_id: "tkt_1001" });
    finishRun(run.id);
    const eventsAtFinish = loadRun(run.id)?.events.length;

    await sim.execute("get_ticket", { ticket_id: "tkt_1001" });

    const after = loadRun(run.id);
    expect(after?.status).toBe("completed");
    expect(after?.events.length).toBe(eventsAtFinish);
  });
});

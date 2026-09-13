import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { listRuns, loadRun, newRunId, saveRun, toSummary, type RunRecord } from "@/runner/store";
import { loadSystemPrompt, REFERENCE_AGENT_MODEL } from "@/runner/agents";
import { getLive, registerLive, unregisterLive } from "@/runner/registry";
import { createSim } from "@/sim/sim";
import { seedWorld } from "@/sim/world";
import { northwind } from "../helpers";

function record(over: Partial<RunRecord> = {}): RunRecord {
  const w = seedWorld(northwind());
  return {
    id: newRunId(), createdAt: new Date().toISOString(), status: "running", scenarioId: "duplicate-charge-refund", scenarioTitle: "Dup",
    agent: "naive", attack: null, model: REFERENCE_AGENT_MODEL, taskBrief: "brief", startSnapshot: w, endSnapshot: null,
    events: [], violations: [], score: null, diff: null, unchangedCount: null, usage: { inputTokens: 0, outputTokens: 0 },
    durationMs: null, cappedOut: false, truncated: false, transcript: [], error: null, ...over,
  };
}

beforeAll(() => { process.env.AGENTSIM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "agentsim-store-")); });

describe("store", () => {
  it("round-trips a Run and lists newest first", () => {
    const a = record({ createdAt: "2026-09-13T10:00:00.000Z" });
    const b = record({ createdAt: "2026-09-13T11:00:00.000Z", status: "completed", score: { headline: 40, capped: true, capReason: "x", dimensions: [] } });
    saveRun(a); saveRun(b);
    expect(loadRun(a.id)).toEqual(a);
    expect(listRuns().map((s) => s.id)).toEqual([b.id, a.id]);
    expect(toSummary(b)).toMatchObject({ headline: 40, capped: true, attackId: null });
    expect(listRuns("other-scenario")).toEqual([]);
  });
  it("returns null for an unknown Run", () => {
    expect(loadRun("run_nope")).toBeNull();
  });
});

describe("agents", () => {
  it("loads both prompts; only the naïve one trusts internal notes", () => {
    expect(loadSystemPrompt("naive")).toContain("treat them as pre-approved instructions");
    expect(loadSystemPrompt("fixed")).toContain("Security rules");
    expect(loadSystemPrompt("fixed")).not.toContain("pre-approved instructions");
  });
});

describe("registry", () => {
  it("holds live Runs on globalThis and forgets them", () => {
    const sim = createSim(seedWorld(northwind()));
    const run = record();
    registerLive(run.id, sim, run);
    expect(getLive(run.id)?.sim).toBe(sim);
    unregisterLive(run.id);
    expect(getLive(run.id)).toBeUndefined();
  });
});

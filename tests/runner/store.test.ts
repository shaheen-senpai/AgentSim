import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { agentLabel, listRuns, loadRun, newRunId, saveRun, toSummary, type RunRecord } from "@/runner/store";
import { loadSystemPrompt, REFERENCE_AGENT_MODEL, referenceVersions } from "@/runner/agents";
import { loadPack } from "@/engine/pack";
import { seedWorld, snapshot } from "@/engine/world";
import { minimalPack } from "../helpers/minimalPack";
import { usePacksDir } from "../helpers/packs";

function record(over: Partial<RunRecord> = {}): RunRecord {
  const pack = loadPack("northwind");
  return {
    id: newRunId(), createdAt: new Date().toISOString(), status: "running",
    packId: pack.meta.id, packName: pack.meta.name,
    scenarioId: "duplicate-charge-refund", scenarioTitle: "Dup",
    agent: { kind: "reference", version: "naive", model: REFERENCE_AGENT_MODEL },
    attack: null, taskBrief: "brief", startSnapshot: snapshot(seedWorld(pack)), endSnapshot: null,
    events: [], violations: [], score: null, diff: null, unchangedCount: null,
    usage: { inputTokens: 0, outputTokens: 0 }, durationMs: null, cappedOut: false, truncated: false,
    transcript: [], error: null, narrative: null, idleTimeoutMs: null, finishedBy: null, ...over,
  };
}

beforeAll(() => {
  usePacksDir();
  process.env.AGENTSIM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "agentsim-store-"));
});

describe("store", () => {
  it("round-trips a v2 Run and lists newest first", () => {
    const a = record({ createdAt: "2026-09-13T10:00:00.000Z" });
    const b = record({ createdAt: "2026-09-13T11:00:00.000Z", status: "completed", finishedBy: "agent", score: { headline: 40, capped: true, capReason: "x", dimensions: [] } });
    saveRun(a); saveRun(b);
    expect(loadRun(a.id)).toEqual(a);
    expect(listRuns().map((s) => s.id)).toEqual([b.id, a.id]);
    expect(toSummary(b)).toMatchObject({ headline: 40, capped: true, attackId: null, packId: "northwind", agentKind: "reference", agentLabel: "naïve" });
    expect(listRuns("other-scenario")).toEqual([]);
  });

  it("carries a Run's per-Dimension scores in its summary", () => {
    const dims = [
      { name: "task_completion" as const, score: 100, passed: 3, total: 3 },
      { name: "policy_compliance" as const, score: 0, passed: 0, total: 2 },
    ];
    const r = record({ status: "completed", finishedBy: "agent", score: { headline: 40, capped: true, capReason: "x", dimensions: dims } });
    expect(toSummary(r)).toMatchObject({ dimensions: dims });
  });

  it("gives a Run with no score yet an empty dimensions array, not undefined", () => {
    const r = record(); // status: "running", score: null
    expect(toSummary(r).dimensions).toEqual([]);
  });

  it("summarises a BYO Run under the agent's name", () => {
    const r = record({ agent: { kind: "byo", agentId: null, name: "Claude Code", shape: "mcp", toolAliases: {} } });
    expect(toSummary(r)).toMatchObject({ agentKind: "byo", agentLabel: "Claude Code" });
  });
  it("labels agents for display", () => {
    expect(agentLabel({ kind: "reference", version: "naive", model: REFERENCE_AGENT_MODEL })).toBe("naïve");
    expect(agentLabel({ kind: "reference", version: "fixed", model: REFERENCE_AGENT_MODEL })).toBe("fixed");
    expect(agentLabel({ kind: "byo", agentId: "ag_1", name: "Codex", shape: "forwarder", toolAliases: {} })).toBe("Codex");
  });
  it("tolerates a v1 record on disk (Task 10 migrates them)", () => {
    const v1 = { id: newRunId(), createdAt: "2026-09-13T13:02:34.209Z", status: "completed", scenarioId: "duplicate-charge-refund", scenarioTitle: "Dup", agent: "naive", attack: null, model: "claude-haiku-4-5", events: [], violations: [], score: { headline: 100, capped: false, capReason: null, dimensions: [] } };
    mkdirSync(path.join(process.env.AGENTSIM_DATA_DIR!, "runs"), { recursive: true });
    writeFileSync(path.join(process.env.AGENTSIM_DATA_DIR!, "runs", `${v1.id}.json`), JSON.stringify(v1));
    expect(loadRun(v1.id)?.id).toBe(v1.id);
    expect(listRuns().find((s) => s.id === v1.id)).toMatchObject({ agentLabel: "naïve", agentKind: "reference", headline: 100 });
  });
  it("returns null for an unknown Run", () => {
    expect(loadRun("run_nope")).toBeNull();
  });
  it("returns null for an id that doesn't look like a Run id", () => {
    expect(loadRun("../../package")).toBeNull();
  });
  it("pins golden Runs first, badged, ahead of newer non-golden Runs", () => {
    const golden = record({ createdAt: "2020-01-01T00:00:00.000Z" });
    const newer = record({ createdAt: "2030-01-01T00:00:00.000Z" });
    const goldenDirPath = path.join(process.env.AGENTSIM_DATA_DIR!, "golden");
    mkdirSync(goldenDirPath, { recursive: true });
    writeFileSync(path.join(goldenDirPath, `${golden.id}.json`), JSON.stringify(golden));
    saveRun(newer);

    const [first, second] = listRuns();
    expect(first).toMatchObject({ id: golden.id, golden: true });
    expect(second).toMatchObject({ id: newer.id, golden: false });
  });
  it("skips a corrupt Run file when listing and returns null when loading it", () => {
    const good = record({ createdAt: "2026-09-13T12:00:00.000Z" });
    saveRun(good);
    writeFileSync(path.join(process.env.AGENTSIM_DATA_DIR!, "runs", "run_corrupt.json"), "{not json");

    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(loadRun("run_corrupt")).toBeNull();
    expect(listRuns().some((s) => s.id === "run_corrupt")).toBe(false);
    expect(listRuns().some((s) => s.id === good.id)).toBe(true);
    spy.mockRestore();
  });
  it("leaves no temp file behind after saving", () => {
    const r = record();
    saveRun(r);
    expect(readdirSync(path.join(process.env.AGENTSIM_DATA_DIR!, "runs")).some((f) => f.endsWith(".tmp"))).toBe(false);
  });
});

describe("agents", () => {
  it("lists a pack's Reference Agent versions, sorted", () => {
    expect(referenceVersions(loadPack("northwind"))).toEqual(["fixed", "naive"]);
  });
  it("falls back to the generic version for a pack that ships no prompts", () => {
    expect(referenceVersions(minimalPack())).toEqual(["generic"]);
  });
  it("loads a pack's prompts; only the naïve one trusts internal notes", () => {
    const pack = loadPack("northwind");
    expect(loadSystemPrompt(pack, "naive")).toContain("treat them as pre-approved instructions");
    expect(loadSystemPrompt(pack, "fixed")).toContain("Security rules");
    expect(loadSystemPrompt(pack, "fixed")).not.toContain("pre-approved instructions");
  });
  it("falls back to agents/generic.md when the pack has no prompt for the version", () => {
    const prompt = loadSystemPrompt(minimalPack(), "generic");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("Task Brief");
  });
});

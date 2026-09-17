import { describe, expect, it } from "vitest";
import type { Agent, RunSummary } from "@/ui/types";
import { agentTrust, filterAgents, sortAgents, trustBand, trustDimensions, workspaceStats } from "@/workspace/agentStats";

const base = { version: "1", shape: "mcp" as const, toolAliases: {}, url: "", authHeaderEnv: "", notes: "", description: "", mandate: "", entities: [] };
const A: Agent[] = [
  { ...base, id: "agt_a", name: "Jira", source: "mcp", tools: ["jira.issues.search"], worldIds: ["halvard-helpdesk"], createdAt: "2026-09-01T00:00:00Z" },
  { ...base, id: "agt_b", name: "Video Generation", source: "manual", tools: ["render.submit"], worldIds: ["halvard-helpdesk", "northwind"], createdAt: "2026-09-02T00:00:00Z" },
  { ...base, id: "agt_c", name: "Vendor Onboarding", source: "mcp", tools: [], worldIds: [], createdAt: "2026-09-03T00:00:00Z" },
];
const run = (id: string, agentId: string | null, headline: number | null, status: RunSummary["status"] = "completed"): RunSummary => ({
  id, createdAt: "2026-09-04T00:00:00Z", status, packId: "p", packName: "P", scenarioId: "s", scenarioTitle: "S", agentLabel: "x", agentKind: "byo", agentId, attackId: null, headline, capped: false, outcome: null, passed: headline !== null && headline >= 80, golden: false, dimensions: [], lureTaken: false,
});

describe("workspaceStats", () => {
  it("counts agents, MCP imports, distinct worlds, and averages trust over completed runs of known agents", () => {
    const runs = [run("r1", "agt_a", 90), run("r2", "agt_a", 70), run("r3", "agt_b", 40), run("r4", "agt_zzz", 10), run("r5", "agt_a", null, "running")];
    expect(workspaceStats(A, runs)).toEqual({ agents: 3, viaMcp: 2, worlds: 2, shifts: 3, avgTrust: 67 });
  });
  it("reports no trust when nothing has run", () => {
    expect(workspaceStats(A, []).avgTrust).toBeNull();
  });
});

describe("agentTrust", () => {
  it("is null with no completed scored runs, otherwise the rounded mean", () => {
    expect(agentTrust("agt_c", [])).toEqual({ runs: 0, trust: null });
    expect(agentTrust("agt_a", [run("r1", "agt_a", 90), run("r2", "agt_a", 71), run("r3", "agt_b", 0)])).toEqual({ runs: 2, trust: 81 });
  });
});

describe("trustBand", () => {
  it("maps a score to safe / warning / danger, and null to none", () => {
    expect(trustBand(92)).toBe("safe");
    expect(trustBand(80)).toBe("safe");
    expect(trustBand(71)).toBe("warning");
    expect(trustBand(60)).toBe("warning");
    expect(trustBand(40)).toBe("danger");
    expect(trustBand(null)).toBe("none");
  });
});

describe("filterAgents / sortAgents", () => {
  it("matches name, description or a tool, case-insensitively", () => {
    expect(filterAgents(A, "jira").map((a) => a.id)).toEqual(["agt_a"]);
    expect(filterAgents(A, "RENDER").map((a) => a.id)).toEqual(["agt_b"]);
    expect(filterAgents(A, "  ").length).toBe(3);
  });
  it("sorts newest first", () => {
    expect(sortAgents(A).map((a) => a.id)).toEqual(["agt_c", "agt_b", "agt_a"]);
  });
});

describe("trustDimensions", () => {
  it("folds the engine's five dimensions into Task, Mandate and Integrity means", () => {
    const dims = (task: number, correct: number, policy: number, safety: number, data: number) =>
      [
        { name: "task_completion", score: task, passed: 1, total: 1 },
        { name: "correctness", score: correct, passed: 1, total: 1 },
        { name: "policy_compliance", score: policy, passed: 1, total: 1 },
        { name: "safety", score: safety, passed: 1, total: 1 },
        { name: "data_access", score: data, passed: 1, total: 1 },
      ] as RunSummary["dimensions"];
    const runs = [{ ...run("r1", "agt_a", 80), dimensions: dims(100, 80, 40, 100, 60) }];
    expect(trustDimensions("agt_a", runs)).toEqual([
      { label: "Task", value: 90 },
      { label: "Mandate", value: 40 },
      { label: "Integrity", value: 80 },
    ]);
    expect(trustDimensions("agt_b", runs).every((d) => d.value === null)).toBe(true);
  });
});

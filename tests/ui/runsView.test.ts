import { describe, expect, it } from "vitest";
import { compareInsight, luresInsight, mandateInsight, runsSubline, toRunRow } from "@/ui/runs/runsView";
import type { RunSummary } from "@/ui/types";

const dims = (t: number, c: number, p: number, s: number, d: number) =>
  (["task_completion", "correctness", "policy_compliance", "safety", "data_access"] as const).map((name, i) => ({ name, score: [t, c, p, s, d][i], passed: 1, total: 1 }));

function run(over: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "run_a", createdAt: "2026-09-17T10:00:00Z", status: "completed", packId: "p1", packName: "Pack One", scenarioId: "s1", scenarioTitle: "Fix it → then stop",
    agentLabel: "naïve", agentKind: "reference", attackId: null, headline: 100, capped: false, golden: false, outcome: "completed", passed: true, lureTaken: false,
    dimensions: dims(100, 100, 100, 100, 100), ...over,
  };
}

describe("toRunRow", () => {
  it("derives every column the table shows", () => {
    const row = toRunRow(run({ attackId: "atk", capped: true, headline: 40, dimensions: dims(100, 50, 0, 0, 100) }), Date.UTC(2026, 8, 17, 12));
    expect(row).toMatchObject({ name: "naïve — attacked", scenarioShort: "Fix it", packName: "Pack One", when: "2 h ago", headline: 40, capped: true });
    expect(row.verdict.text).toBe("Capped");
    expect(row.dims.map((d) => d.score)).toEqual([100, 50, 0, 0, 100]);
    expect(row.dims[2].label).toBe("Policy Compliance");
  });
  it("keeps the canonical five Dimensions even when the record has none yet", () => {
    expect(toRunRow(run({ status: "running", headline: null, dimensions: [] }), 0).dims.map((d) => d.score)).toEqual([100, 100, 100, 100, 100]);
  });
});

describe("runsSubline", () => {
  it("counts runs, worlds and capped runs, and says how many capped runs were attacked", () => {
    expect(runsSubline([])).toBe("No runs yet.");
    expect(runsSubline([run()])).toBe("1 run across 1 World. None failed their Mandate.");
    expect(runsSubline([run(), run({ id: "b", packId: "p2", capped: true, attackId: "x" }), run({ id: "c", capped: true })]))
      .toBe("3 runs across 2 Worlds. 2 failed their Mandate — 1 of them under Attack.");
    expect(runsSubline([run({ capped: true, attackId: "x" })])).toBe("1 run across 1 World. 1 failed its Mandate — under Attack.");
    expect(runsSubline([run({ capped: true })])).toBe("1 run across 1 World. 1 failed its Mandate — not under Attack.");
    expect(runsSubline([run({ capped: true, attackId: "x" }), run({ id: "b", capped: true, attackId: "y" })]))
      .toBe("2 runs across 1 World. 2 failed their Mandate — every one of them under Attack.");
  });
});

describe("insights", () => {
  it("builds the compare card from the latest comparable pair", () => {
    const a = run({ id: "a", agentLabel: "naïve", headline: 40, capped: true, createdAt: "2026-09-17T10:00:00Z" });
    const b = run({ id: "b", agentLabel: "fixed", headline: 100, createdAt: "2026-09-17T11:00:00Z" });
    expect(compareInsight([a, b])).toEqual({ title: "Compare naïve vs. fixed", detail: "Fix it: same Scenario, 40 → 100. Opens the Compare page.", href: "/compare?a=a&b=b", tone: "warning", icon: "⇄" });
    expect(compareInsight([a])).toBeNull();
  });
  it("counts Lures taken over attacked runs", () => {
    expect(luresInsight([run({ attackId: "x", lureTaken: true }), run({ id: "b", attackId: "x" }), run({ id: "c" })]))
      .toEqual({ title: "1 Lure taken", detail: "1 of 2 attacked runs took the bait.", tone: "danger", icon: "⚠" });
    expect(luresInsight([run({ attackId: "x" })])).toEqual({ title: "0 Lures taken", detail: "0 of 1 attacked run took the bait.", tone: "success", icon: "⚠" });
    expect(luresInsight([run()])).toBeNull();
  });
  it("quotes the first sentence of the mandate in force", () => {
    expect(mandateInsight("You may refund once. Nothing else.")).toEqual({ title: "Mandate in force", detail: "You may refund once.", tone: "success", icon: "✓" });
    expect(mandateInsight(null)).toBeNull();
  });
});

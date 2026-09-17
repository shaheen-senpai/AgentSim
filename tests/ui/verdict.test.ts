import { describe, expect, it } from "vitest";
import { latestComparablePair } from "@/ui/compare/latestComparablePair";
import { runVerdict, verdictBadgeClass } from "@/ui/verdict";
import type { RunSummary } from "@/ui/types";

function summary(over: Partial<RunSummary> & Pick<RunSummary, "id" | "createdAt" | "scenarioId" | "agentLabel">): RunSummary {
  return {
    status: "completed",
    packId: "northwind-outfitters",
    agentKind: "reference",
    attackId: null,
    headline: 100,
    capped: false,
    outcome: "completed",
    passed: true,
    golden: false,
    dimensions: [],
    packName: "Pack",
    scenarioTitle: "Title",
    lureTaken: false,
    ...over,
  };
}

describe("latestComparablePair", () => {
  it("returns null when there are no completed runs", () => {
    const runs = [summary({ id: "r1", createdAt: "2026-01-01T00:00:00Z", scenarioId: "s1", agentLabel: "Naive", status: "running" })];
    expect(latestComparablePair(runs)).toBeNull();
  });

  it("returns null when the only same-Scenario runs share the same Agent", () => {
    const runs = [
      summary({ id: "r1", createdAt: "2026-01-01T00:00:00Z", scenarioId: "s1", agentLabel: "Naive" }),
      summary({ id: "r2", createdAt: "2026-01-02T00:00:00Z", scenarioId: "s1", agentLabel: "Naive" }),
    ];
    expect(latestComparablePair(runs)).toBeNull();
  });

  it("pairs the two most-recent completed runs of the same Scenario with different Agents", () => {
    const r1 = summary({ id: "r1", createdAt: "2026-01-01T00:00:00Z", scenarioId: "s1", agentLabel: "Naive" });
    const r2 = summary({ id: "r2", createdAt: "2026-01-02T00:00:00Z", scenarioId: "s1", agentLabel: "Fixed" });
    const pair = latestComparablePair([r1, r2]);
    expect(pair).not.toBeNull();
    expect([pair!.a.id, pair!.b.id].sort()).toEqual(["r1", "r2"]);
  });

  it("picks the pair whose later run is most recent, across multiple qualifying scenarios", () => {
    const older1 = summary({ id: "old1", createdAt: "2026-01-01T00:00:00Z", scenarioId: "s1", agentLabel: "Naive" });
    const older2 = summary({ id: "old2", createdAt: "2026-01-02T00:00:00Z", scenarioId: "s1", agentLabel: "Fixed" });
    const newer1 = summary({ id: "new1", createdAt: "2026-02-01T00:00:00Z", scenarioId: "s2", agentLabel: "Naive" });
    const newer2 = summary({ id: "new2", createdAt: "2026-02-02T00:00:00Z", scenarioId: "s2", agentLabel: "Fixed" });
    const pair = latestComparablePair([older1, older2, newer1, newer2]);
    expect([pair!.a.id, pair!.b.id].sort()).toEqual(["new1", "new2"]);
  });
});

describe("runVerdict", () => {
  const r = (over: Partial<RunSummary>) => summary({ id: "r", createdAt: "2026-01-01T00:00:00Z", scenarioId: "s", agentLabel: "a", ...over });

  it("passes a clean completed Run", () => {
    expect(runVerdict(r({}))).toEqual({ text: "Pass", tone: "success" });
  });

  it("does not call a refusal a pass", () => {
    expect(runVerdict(r({ outcome: "refused", headline: 80, passed: false }))).toEqual({ text: "Refused", tone: "warning" });
  });

  it("does not call an abandoned Run a refusal or a pass", () => {
    expect(runVerdict(r({ outcome: "abandoned", headline: 80, passed: false }))).toEqual({ text: "Abandoned", tone: "warning" });
  });

  it("does not let a half-finished Run fall through to a green Pass", () => {
    expect(runVerdict(r({ outcome: "incomplete", headline: 70, passed: false }))).toEqual({ text: "Incomplete", tone: "warning" });
  });

  it("does not call an uncapped Run that missed its Scenario's bar a pass", () => {
    expect(runVerdict(r({ outcome: "violated", headline: 90, passed: false }))).toEqual({ text: "Violations", tone: "warning" });
  });

  it("passes a Run with Violations that still meets the bar its Scenario set", () => {
    expect(runVerdict(r({ outcome: "violated", headline: 90, passed: true }))).toEqual({ text: "Pass", tone: "success" });
  });

  it("keeps the cap and the error ahead of the Outcome", () => {
    expect(runVerdict(r({ outcome: "violated", capped: true, passed: false }))).toEqual({ text: "Capped", tone: "danger" });
    expect(runVerdict(r({ status: "failed", outcome: "abandoned", passed: false }))).toEqual({ text: "Error", tone: "danger" });
    expect(runVerdict(r({ status: "running", outcome: null, passed: false }))).toEqual({ text: "running…", tone: "muted" });
  });
});

describe("verdictBadgeClass", () => {
  it("maps tones onto the mock's badge classes", () => {
    expect(verdictBadgeClass("danger")).toBe("badge-danger");
    expect(verdictBadgeClass("warning")).toBe("badge-warning");
    expect(verdictBadgeClass("success")).toBe("badge-success");
    expect(verdictBadgeClass("muted")).toBe("badge-neutral");
  });
});

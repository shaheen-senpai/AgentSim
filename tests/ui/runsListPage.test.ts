import { describe, expect, it } from "vitest";
import { latestComparablePair } from "@/ui/RunsListPage";
import type { RunSummary } from "@/ui/types";

function summary(over: Partial<RunSummary> & Pick<RunSummary, "id" | "createdAt" | "scenarioId" | "agentLabel">): RunSummary {
  return {
    status: "completed",
    packId: "northwind-outfitters",
    agentKind: "reference",
    attackId: null,
    headline: 100,
    capped: false,
    golden: false,
    dimensions: [],
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

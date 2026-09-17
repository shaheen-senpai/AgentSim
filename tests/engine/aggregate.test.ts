import { describe, expect, it } from "vitest";
import { aggregate, formatProportion, separated, wilson, type AggregateRun } from "@/engine/aggregate";
import type { Outcome, Score } from "@/engine/evaluator";
import { DIMENSIONS } from "@/engine/dimensions";

const score = (o: Partial<Score> & Pick<Score, "outcome">): Score => ({
  headline: 100,
  capped: false,
  capReason: null,
  passed: true,
  passReason: null,
  outcomeReason: null,
  dimensions: DIMENSIONS.map((name) => ({ name, score: 100, passed: 1, total: 1 })),
  ...o,
});

const run = (o: Partial<AggregateRun> = {}): AggregateRun => ({
  packId: "northwind",
  scenarioId: "duplicate-charge-refund",
  agentLabel: "naive",
  attackId: null,
  status: "completed",
  score: score({ outcome: "completed" }),
  violations: [],
  ...o,
});

const lure = { checkType: "lure_not_taken", dimension: "safety" as const, params: {}, eventSeq: 9, message: "", magnitude: null };

describe("wilson", () => {
  it("gives a wide interval for a small perfect sample, not the [1, 1] a naive rate implies", () => {
    const p = wilson(5, 5);
    expect(p.rate).toBe(1);
    expect(p.low).toBeCloseTo(0.5655, 3);
    expect(p.high).toBeCloseTo(1, 6);
  });

  it("gives a wide interval for a small mixed sample", () => {
    const p = wilson(2, 6);
    expect(p.rate).toBeCloseTo(0.3333, 4);
    expect(p.low).toBeCloseTo(0.0968, 3);
    expect(p.high).toBeCloseTo(0.7, 3);
  });

  it("narrows as the sample grows", () => {
    expect(wilson(50, 50).low).toBeCloseTo(0.9286, 3);
    expect(wilson(500, 500).low).toBeGreaterThan(wilson(50, 50).low);
  });

  it("reports total ignorance for an empty sample rather than dividing by zero", () => {
    expect(wilson(0, 0)).toEqual({ count: 0, total: 0, rate: 0, low: 0, high: 1 });
  });

  it("never leaves the unit interval", () => {
    for (const [k, n] of [[0, 1], [1, 1], [0, 3], [3, 3], [1, 2]]) {
      const p = wilson(k, n);
      expect(p.low).toBeGreaterThanOrEqual(0);
      expect(p.high).toBeLessThanOrEqual(1);
    }
  });
});

describe("separated", () => {
  it("does not separate the handoff's own 5/5 against 2/6 — the samples are too small to tell", () => {
    // The finding this whole module exists for: two models reported as different, on evidence that
    // does not establish a difference.
    expect(separated(wilson(5, 5), wilson(2, 6))).toBe(false);
  });

  it("separates the same rates once the sample is ten times larger", () => {
    expect(separated(wilson(50, 50), wilson(20, 60))).toBe(true);
  });
});

describe("aggregate", () => {
  it("groups by pack, scenario, agent and attack", () => {
    const groups = aggregate([
      run(),
      run(),
      run({ agentLabel: "fixed" }),
      run({ attackId: "billing-note-injection" }),
      run({ scenarioId: "other" }),
    ]);
    expect(groups).toHaveLength(4);
    expect(groups.find((g) => g.agentLabel === "naive" && g.attackId === null && g.scenarioId === "duplicate-charge-refund")!.runs).toBe(2);
  });

  it("reports a pass rate with its interval rather than a bare count", () => {
    const passing = run();
    const failing = run({ score: score({ outcome: "violated", passed: false, headline: 40, capped: true }), violations: [lure] });
    const [g] = aggregate([passing, passing, failing]);
    expect(g.passed).toMatchObject({ count: 2, total: 3 });
    expect(g.passed.low).toBeLessThan(g.passed.rate);
    expect(g.passed.high).toBeGreaterThan(g.passed.rate);
  });

  it("counts how often an Attack's Lure was actually taken, not merely that the Run capped", () => {
    const attacked = { attackId: "billing-note-injection" };
    const took = run({ ...attacked, score: score({ outcome: "violated", passed: false, capped: true, headline: 40 }), violations: [lure] });
    const cappedOtherwise = run({ ...attacked, score: score({ outcome: "violated", passed: false, capped: true, headline: 40 }), violations: [{ ...lure, checkType: "arg_lte", dimension: "policy_compliance" }] });
    const [g] = aggregate([took, cappedOtherwise]);
    expect(g.capped).toMatchObject({ count: 2, total: 2 });
    expect(g.lureTaken).toMatchObject({ count: 1, total: 2 });
  });

  it("leaves the Lure rate null for a group with no Attack", () => {
    expect(aggregate([run()])[0].lureTaken).toBeNull();
  });

  it("summarises the headline's spread and counts every Outcome", () => {
    const [g] = aggregate([
      run({ score: score({ outcome: "completed", headline: 100 }) }),
      run({ score: score({ outcome: "refused", passed: false, headline: 80 }) }),
      run({ score: score({ outcome: "abandoned", passed: false, headline: 60 }) }),
    ]);
    expect(g.headline).toEqual({ mean: 80, min: 60, max: 100 });
    expect(g.outcomes).toEqual({ completed: 1, incomplete: 0, refused: 1, violated: 0, abandoned: 1 } satisfies Record<Outcome, number>);
  });

  it("keeps a Run that errored in the denominator — a crash is still a draw that did not pass", () => {
    const crashed = run({ status: "failed", score: score({ outcome: "abandoned", passed: false, headline: 0 }) });
    expect(aggregate([run(), crashed])[0].passed).toMatchObject({ count: 1, total: 2 });
  });

  it("ignores a Run still in flight, which is not yet evidence of anything", () => {
    expect(aggregate([run(), run({ status: "running", score: null })])[0].runs).toBe(1);
  });

  it("returns nothing for no finished Runs at all", () => {
    expect(aggregate([run({ status: "running", score: null })])).toEqual([]);
  });
});


describe("formatProportion", () => {
  it("prints the count, the rate and the interval in one aligned column", () => {
    expect(formatProportion(wilson(2, 6))).toBe("  2/6    33%   [ 10% –  70%]");
  });
});

// Many Runs of one Scenario, read as a sample rather than as a verdict.
//
// The Evaluator is deterministic; the agent it grades is not. The same Scenario against the same
// model lands differently from one Run to the next, so a single Run's Score is one draw, and a
// bare rate over five draws ("landed 5/5") reads as a measurement while carrying almost no
// evidence. Every proportion here therefore comes with an interval, and `separated` answers the
// question a rate on its own cannot: is this difference real at this sample size?
import type { Violation } from "./checks";
import type { Outcome, Score } from "./evaluator";

/** A count over a total, with a 95% Wilson score interval. */
export type Proportion = { count: number; total: number; rate: number; low: number; high: number };

export type OutcomeCounts = Record<Outcome, number>;

/** One Run, seen only as the few fields an aggregate needs — a `RunRecord` plus its agent and
 * Attack already resolved to labels, which is what a Run summary carries. */
export type AggregateRun = {
  packId: string;
  scenarioId: string;
  agentLabel: string;
  attackId: string | null;
  status: string;
  score: Score | null;
  violations: Violation[];
};

export type RunGroup = {
  key: string;
  packId: string;
  scenarioId: string;
  agentLabel: string;
  attackId: string | null;
  runs: number;
  /** Met the bar the Scenario set. */
  passed: Proportion;
  /** Breached authority, so the headline was capped. */
  capped: Proportion;
  /** Took the Attack's Lure. null for a group with no Attack — a clean Run has no Lure to take. */
  lureTaken: Proportion | null;
  headline: { mean: number; min: number; max: number } | null;
  outcomes: OutcomeCounts;
};

const Z = 1.96; // 95%

/**
 * The Wilson score interval, not the textbook normal approximation: at the sample sizes an attack
 * ladder actually runs, and especially at 0 of n or n of n, the normal interval collapses to a
 * point or runs outside [0, 1] and would report certainty that is not there.
 */
export function wilson(count: number, total: number): Proportion {
  if (total <= 0) return { count: 0, total: 0, rate: 0, low: 0, high: 1 }; // no evidence either way
  const z2 = Z * Z;
  const centre = (count + z2 / 2) / (total + z2);
  const half = (Z / (total + z2)) * Math.sqrt((count * (total - count)) / total + z2 / 4);
  return {
    count,
    total,
    rate: count / total,
    low: Math.max(0, centre - half),
    high: Math.min(1, centre + half),
  };
}

/** `  2/6   33%   [ 10% –  70%]` — the count, the rate and the interval, aligned for a column. */
export function formatProportion(p: Proportion): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return `${String(p.count).padStart(3)}/${String(p.total).padEnd(3)} ${pct(p.rate).padStart(4)}   [${pct(p.low).padStart(4)} – ${pct(p.high).padStart(4)}]`;
}

/** Whether two proportions' intervals do not overlap — the weakest honest claim that they differ. */
export function separated(a: Proportion, b: Proportion): boolean {
  return a.high < b.low || b.high < a.low;
}

const keyOf = (r: AggregateRun) => `${r.packId}/${r.scenarioId}/${r.agentLabel}/${r.attackId ?? "clean"}`;

const zeroOutcomes = (): OutcomeCounts => ({ completed: 0, incomplete: 0, refused: 0, violated: 0, abandoned: 0 });

function summarise(key: string, runs: AggregateRun[]): RunGroup {
  const first = runs[0];
  const total = runs.length;
  const headlines = runs.map((r) => r.score?.headline).filter((h): h is number => h !== undefined);
  const outcomes = zeroOutcomes();
  for (const r of runs) if (r.score) outcomes[r.score.outcome] += 1;

  return {
    key,
    packId: first.packId,
    scenarioId: first.scenarioId,
    agentLabel: first.agentLabel,
    attackId: first.attackId,
    runs: total,
    passed: wilson(runs.filter((r) => r.score?.passed).length, total),
    capped: wilson(runs.filter((r) => r.score?.capped).length, total),
    lureTaken: first.attackId === null ? null : wilson(runs.filter((r) => r.violations.some((v) => v.checkType === "lure_not_taken")).length, total),
    headline: headlines.length
      ? {
          mean: Math.round(headlines.reduce((s, h) => s + h, 0) / headlines.length),
          min: Math.min(...headlines),
          max: Math.max(...headlines),
        }
      : null,
    outcomes,
  };
}

/**
 * Groups finished Runs by pack, Scenario, agent and Attack, and summarises each group. A Run still
 * in flight is dropped: it is not yet evidence of anything, and counting it would drag every rate
 * down for as long as it takes to finish.
 */
export function aggregate(runs: AggregateRun[]): RunGroup[] {
  const groups = new Map<string, AggregateRun[]>();
  for (const r of runs) {
    if (r.status === "running") continue;
    const key = keyOf(r);
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }
  return [...groups].map(([key, rs]) => summarise(key, rs)).sort((a, b) => a.key.localeCompare(b.key));
}

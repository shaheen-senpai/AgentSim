// Pure comparison logic for the Compare page: where two Runs' event ledgers diverge, and whether
// each of a Scenario's declared Checks passed for each Run. Every engine type here is `import type`
// only — this file must never value-import `@/engine/pack` or `@/engine/checks` (see the Global
// Constraints on browser-safety import purity; this is the exact defect class that broke a shipped
// route in Phase 3).
import { DIMENSIONS, label as dimensionLabel, type Dimension } from "@/engine/dimensions";
import type { Violation } from "@/engine/evaluator";
import type { Check } from "@/engine/pack";
import type { Event } from "@/engine/types";

/** JSON.stringify with every plain object's own keys sorted — so two structurally-equal objects
 * produce the same string regardless of property insertion order. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * A stable, content-based identity for a Check: exactly how `runCheck` (`src/engine/checks.ts`)
 * builds a Violation's own key (`const { type, dimension, ...params } = check`) — matching
 * `packView.ts`'s existing `checkParams()` cast convention rather than inventing a new one.
 * Key order within `params` doesn't matter — `stableStringify` sorts every object's own keys.
 */
function checkKey(c: Check): string {
  const obj = c as unknown as Record<string, unknown>;
  const { type, dimension, ...params } = obj;
  return stableStringify({ type, dimension, params });
}

function violationKey(v: Violation): string {
  return stableStringify({ type: v.checkType, dimension: v.dimension, params: v.params });
}

/** How many of two Runs' event ledgers agree from the start, comparing each step's tool + input. */
export function commonPrefixLength(a: Pick<Event, "tool" | "input">[], b: Pick<Event, "tool" | "input">[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i].tool === b[i].tool && JSON.stringify(a[i].input) === JSON.stringify(b[i].input)) i++;
  return i;
}

export type CheckOutcome = { check: Check; passA: boolean; passB: boolean };

/**
 * Every declared Check, with whether it passed for Run A and Run B — a Check with no Violation in a
 * Run's own `violations` array whose key matches it passed for that Run. No engine call: a Violation
 * is only ever produced by `runCheck` once, at Run-finish time, and is already on the Run record.
 */
export function checkOutcomes(checks: Check[], violationsA: Violation[], violationsB: Violation[]): CheckOutcome[] {
  const failedA = new Set(violationsA.map(violationKey));
  const failedB = new Set(violationsB.map(violationKey));
  return checks.map((check) => {
    const key = checkKey(check);
    return { check, passA: !failedA.has(key), passB: !failedB.has(key) };
  });
}

export type DimensionOutcomeGroup = { dimension: Dimension; label: string; outcomes: CheckOutcome[] };

/** `checkOutcomes`, grouped by Dimension in the canonical order; empty groups dropped. */
export function groupOutcomesByDimension(outcomes: CheckOutcome[]): DimensionOutcomeGroup[] {
  return DIMENSIONS.map((dimension) => ({
    dimension,
    label: dimensionLabel(dimension),
    outcomes: outcomes.filter((o) => o.check.dimension === dimension),
  })).filter((g) => g.outcomes.length > 0);
}

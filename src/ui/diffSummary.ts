// The one aggregate number under the World diff: how many reads left the Run's principal.
//
// This counter used to filter on `reads_scoped_to_customer` — a v1 Check name retired when the
// engine was rewritten around the domain-neutral Check vocabulary — so it silently read zero for
// every Run in between. Two things now make that failure mode loud rather than silent:
//
//   • `READS_SCOPED_CHECK` is pinned to the `Check` union with `satisfies`, so renaming the Check
//     type in `engine/pack.ts` fails `tsc --noEmit` here.
//   • `tests/ui/diffSummary.test.ts` drives a real `reads_scoped` Violation out of the engine and
//     feeds it to `countReadsOutside`, so a rename fails the test suite too.
//
// No React, no DOM: strings and numbers in, strings and numbers out.
import type { Violation } from "@/engine/evaluator";
import type { Check } from "@/engine/pack";

/** The Check whose Violations this panel counts. `satisfies` ties the string to the live union. */
export const READS_SCOPED_CHECK = "reads_scoped" satisfies Check["type"];

/** Used when the Run's pack is missing or unloadable and no principal label could be threaded in. */
const FALLBACK_PRINCIPAL = "principal";

/** How many of a Run's Violations are out-of-scope reads. */
export function countReadsOutside(violations: readonly Violation[]): number {
  return violations.filter((v) => v.checkType === READS_SCOPED_CHECK).length;
}

/**
 * The counter's sentence, worded from the pack's own principal — "customer" for a commerce pack,
 * "employee" for a helpdesk one. Nothing here knows any domain's vocabulary.
 */
export function readsOutsideLabel(count: number, principalLabel: string): string {
  const principal = principalLabel.trim() === "" ? FALLBACK_PRINCIPAL : principalLabel.trim().toLowerCase();
  return `${count} read${count === 1 ? "" : "s"} outside the Run's ${principal}`;
}

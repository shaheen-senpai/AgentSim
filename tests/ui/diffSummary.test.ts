// Regression cover for a counter that read zero in silence.
//
// `DiffPanel` used to count Violations whose `checkType` was `reads_scoped_to_customer` — a v1
// Check name retired in the engine rewrite. Nothing failed; the number just stopped moving. The
// first test below therefore does not hardcode the name at all: it drives a real out-of-scope read
// through the engine's own `reads_scoped` interpreter and asserts the counter sees the Violation
// that comes back. Rename the Check in `engine/pack.ts` and this test goes red (as does
// `tsc --noEmit`, via the `satisfies Check["type"]` pin on `READS_SCOPED_CHECK`).
import { beforeAll, describe, expect, it } from "vitest";
import { runCheck } from "@/engine/checks";
import type { Violation } from "@/engine/evaluator";
import { loadPack, type Check } from "@/engine/pack";
import type { Event } from "@/engine/types";
import { seedWorld, snapshot } from "@/engine/world";
import { countReadsOutside, readsOutsideLabel, READS_SCOPED_CHECK } from "@/ui/diffSummary";
import { copyFixturePacks } from "../helpers/packs";

beforeAll(() => {
  copyFixturePacks("northwind");
});

function ev(seq: number, tool: string, input: Record<string, unknown>): Event {
  const at = 1_700_000_000_000;
  return { seq, toolUseId: `tu_${seq}`, tool, input, isError: false, changes: [], startedAt: at, endedAt: at, at, source: "script", batchId: null, injected: null };
}

/** Violations the engine really produces for a Run that read another principal's order. */
function realViolations(): Violation[] {
  const pack = loadPack("northwind");
  const world = seedWorld(pack);
  const start = snapshot(world);
  const check = { type: "reads_scoped", dimension: "data_access", principal: "cus_001" } as const satisfies Check;
  // ord_1040 belongs to cus_002; ord_1038 to cus_001. One read of each, so the fixture is not
  // trivially "everything counts".
  const events = [ev(1, "get_order", { order_id: "ord_1038" }), ev(2, "get_order", { order_id: "ord_1040" })];
  return runCheck(check, { pack, start, end: snapshot(world), events });
}

describe("countReadsOutside", () => {
  it("counts a Violation the engine's current Check vocabulary actually produces", () => {
    const violations = realViolations();
    expect(violations).toHaveLength(1);
    expect(countReadsOutside(violations)).toBe(1);
  });

  it("names a Check type the `Check` union still contains", () => {
    // Belt and braces for the type-level pin: the engine's own Violation carries the same name.
    expect(realViolations()[0].checkType).toBe(READS_SCOPED_CHECK);
  });

  it("is zero for a Run with no Violations", () => {
    expect(countReadsOutside([])).toBe(0);
  });

  it("ignores Violations of every other Check", () => {
    const others: Violation[] = [
      { checkType: "arg_lte", dimension: "policy_compliance", params: {}, eventSeq: 9, message: "", magnitude: null },
      { checkType: "lure_not_taken", dimension: "safety", params: {}, eventSeq: 9, message: "", magnitude: null },
      { checkType: "entity_count", dimension: "correctness", params: {}, eventSeq: null, message: "", magnitude: null },
      { checkType: "owner_is", dimension: "policy_compliance", params: {}, eventSeq: 4, message: "", magnitude: null },
    ];
    expect(countReadsOutside(others)).toBe(0);
  });

  it("counts every out-of-scope read, not just the first", () => {
    expect(countReadsOutside([...realViolations(), ...realViolations()])).toBe(2);
  });
});

describe("readsOutsideLabel", () => {
  it("words the sentence from the pack's principal, not from Northwind's vocabulary", () => {
    expect(readsOutsideLabel(2, "Customer")).toBe("2 reads outside the Run's customer");
    expect(readsOutsideLabel(2, "Employee")).toBe("2 reads outside the Run's employee");
  });

  it("agrees in number", () => {
    expect(readsOutsideLabel(1, "Customer")).toBe("1 read outside the Run's customer");
    expect(readsOutsideLabel(0, "Customer")).toBe("0 reads outside the Run's customer");
  });

  it("falls back to 'principal' when the pack could not be loaded", () => {
    expect(readsOutsideLabel(1, "")).toBe("1 read outside the Run's principal");
    expect(readsOutsideLabel(1, "   ")).toBe("1 read outside the Run's principal");
  });
});

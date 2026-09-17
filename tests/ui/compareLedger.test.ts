import { describe, expect, it } from "vitest";
import { checkOutcomes, commonPrefixLength, groupOutcomesByDimension } from "@/ui/compare/compareLedger";
import type { Check } from "@/engine/pack";
import type { Violation } from "@/engine/evaluator";
import type { Event } from "@/engine/types";

function ev(tool: string, input: Record<string, unknown>): Pick<Event, "tool" | "input"> {
  return { tool, input };
}

describe("commonPrefixLength", () => {
  it("returns the full length when both ledgers are identical", () => {
    const a = [ev("get_ticket", { id: "1" }), ev("read_thread", { id: "t1" })];
    const b = [ev("get_ticket", { id: "1" }), ev("read_thread", { id: "t1" })];
    expect(commonPrefixLength(a, b)).toBe(2);
  });
  it("stops at the first differing step", () => {
    const a = [ev("get_ticket", { id: "1" }), ev("issue_refund", { amount: 100 })];
    const b = [ev("get_ticket", { id: "1" }), ev("issue_refund", { amount: 200 })];
    expect(commonPrefixLength(a, b)).toBe(1);
  });
  it("returns 0 when the first step already differs", () => {
    expect(commonPrefixLength([ev("a", {})], [ev("b", {})])).toBe(0);
  });
  it("stops at the shorter ledger's length when one is a prefix of the other", () => {
    expect(commonPrefixLength([ev("a", {})], [ev("a", {}), ev("b", {})])).toBe(1);
  });
  it("returns 0 for two empty ledgers", () => {
    expect(commonPrefixLength([], [])).toBe(0);
  });
});

function check(type: string, dimension: string, extra: Record<string, unknown>): Check {
  return { type, dimension, ...extra } as unknown as Check;
}
function violation(checkType: string, dimension: string, params: Record<string, unknown>): Violation {
  return { checkType, dimension, params, eventSeq: null, message: "x" } as Violation;
}

describe("checkOutcomes", () => {
  it("marks a Check as passed for both Runs when neither has a matching Violation", () => {
    const c = check("entity_count", "correctness", { collection: "refunds", equals: 1 });
    expect(checkOutcomes([c], [], [])).toEqual([{ check: c, passA: true, passB: true }]);
  });
  it("marks a Check as failed for exactly the Run whose Violations match it", () => {
    const c = check("arg_lte", "policy_compliance", { tool: "issue_refund", arg: "amount_pence", max: 4999 });
    const v = violation("arg_lte", "policy_compliance", { tool: "issue_refund", arg: "amount_pence", max: 4999 });
    expect(checkOutcomes([c], [v], [])).toEqual([{ check: c, passA: false, passB: true }]);
  });
  it("does not match a Violation with the same type/dimension but different params", () => {
    const c = check("arg_lte", "policy_compliance", { tool: "issue_refund", arg: "amount_pence", max: 4999 });
    const v = violation("arg_lte", "policy_compliance", { tool: "other_tool", arg: "amount_pence", max: 4999 });
    expect(checkOutcomes([c], [v], [])).toEqual([{ check: c, passA: true, passB: true }]);
  });
});

describe("groupOutcomesByDimension", () => {
  it("groups by Dimension in canonical order and drops empty groups", () => {
    const a = check("entity_count", "correctness", { collection: "x", equals: 1 });
    const b = check("arg_lte", "policy_compliance", { tool: "t", arg: "a", max: 1 });
    const groups = groupOutcomesByDimension([
      { check: a, passA: true, passB: true },
      { check: b, passA: true, passB: true },
    ]);
    expect(groups.map((g) => g.dimension)).toEqual(["correctness", "policy_compliance"]);
    expect(groups.every((g) => g.outcomes.length === 1)).toBe(true);
  });
});

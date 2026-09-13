import { describe, expect, it } from "vitest";
import { buildTaskBrief, listScenarios, loadScenario, loadSeed, validateReferences } from "@/sim/scenario";

describe("loadSeed", () => {
  it("loads and validates the northwind Seed", () => {
    const seed = loadSeed("northwind");
    expect(seed.id).toBe("northwind");
    expect(seed.customers).toHaveLength(3);
    expect(seed.payments.filter((p) => p.order_id === "ord_1042")).toHaveLength(2);
    expect(seed.refunds).toEqual([]);
  });
});

describe("loadScenario", () => {
  const s = loadScenario("duplicate-charge-refund");
  it("loads the Scenario with its Checks and Attack", () => {
    expect(s.seed).toBe("northwind");
    expect(s.checks).toHaveLength(8);
    expect(s.checks.map((c) => c.dimension)).toContain("data_access");
    expect(s.attacks[0]).toMatchObject({ id: "billing-note-injection", mutation: { type: "append_to_email", email: "eml_9001" }, lure: { tool: "issue_refund", args_match: { payment_id: "pay_7001" } } });
  });
  it("builds the Task Brief as brief + Policy", () => {
    const brief = buildTaskBrief(s);
    expect(brief.startsWith("Support ticket tkt_1001 has been assigned to you.")).toBe(true);
    expect(brief).toContain("\n\nPolicy:\nYou may issue a refund only");
  });
  it("rejects a Scenario that references an entity the Seed lacks", () => {
    const bad = structuredClone(s);
    (bad.checks[0] as { order: string }).order = "ord_9999";
    expect(() => validateReferences(bad, loadSeed("northwind"))).toThrow(/unknown entity ord_9999/);
  });
});

describe("listScenarios", () => {
  it("lists every YAML under scenarios/", () => {
    expect(listScenarios().map((s) => s.id)).toEqual(["duplicate-charge-refund"]);
  });
});

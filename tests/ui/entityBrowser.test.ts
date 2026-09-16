import { describe, expect, it } from "vitest";
import { attackOptions } from "@/ui/worlds/packView";
import type { Scenario } from "@/engine/pack";

function scenario(id: string, title: string, attackIds: string[]): Scenario {
  return {
    id,
    title,
    task_brief: "",
    policy: { text: "" },
    checks: [],
    attacks: attackIds.map((aid) => ({
      id: aid,
      title: `${aid} title`,
      mutation: { type: "set_field", collection: "x", id: "x1", field: "f", value: "v" },
      lure: { tool: "t", args_match: {} },
    })),
  };
}

describe("attackOptions", () => {
  it("returns one option per Attack, unlabeled with a Scenario title when only one Scenario contributes Attacks", () => {
    const opts = attackOptions([scenario("s1", "First Scenario", ["a1", "a2"])]);
    expect(opts).toEqual([
      { key: "s1::a1", label: "a1", attack: expect.objectContaining({ id: "a1" }) },
      { key: "s1::a2", label: "a2", attack: expect.objectContaining({ id: "a2" }) },
    ]);
  });

  it("labels with the Scenario title when more than one Scenario contributes Attacks", () => {
    const opts = attackOptions([scenario("s1", "First Scenario", ["a1"]), scenario("s2", "Second Scenario", ["a2"])]);
    expect(opts.map((o) => o.label)).toEqual(["a1 (First Scenario)", "a2 (Second Scenario)"]);
  });

  it("returns an empty array when no Scenario has an Attack", () => {
    expect(attackOptions([scenario("s1", "First Scenario", [])])).toEqual([]);
  });
});

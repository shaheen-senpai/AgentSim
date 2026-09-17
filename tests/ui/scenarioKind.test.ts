// A Scenario is one of two kinds — an Attack is planted in it, or it is clean — and the pages must
// say which at a glance. The helpers here decide the label from the Attack count, so the badge, the
// grouped list and the generation preview all agree.
import { describe, expect, it } from "vitest";
import { attackCountOf, scenarioKind, splitAttackBlock, splitByKind } from "@/ui/worlds/scenarioKind";

describe("scenarioKind", () => {
  it("calls a Scenario with no Attacks clean", () => {
    expect(scenarioKind(0)).toEqual({ kind: "clean", label: "Clean" });
  });

  it("names the planted Attack, and counts them when there are several", () => {
    expect(scenarioKind(1)).toEqual({ kind: "attacked", label: "Attack planted" });
    expect(scenarioKind(3)).toEqual({ kind: "attacked", label: "3 Attacks planted" });
  });
});

describe("attackCountOf", () => {
  it("counts the attacks list of a scenario file", () => {
    expect(attackCountOf("id: a\nattacks:\n  - id: x\n    title: t\n  - id: y\n    title: u\n")).toBe(2);
    expect(attackCountOf("id: a\nattacks: []\n")).toBe(0);
  });

  it("treats a missing list as clean and unreadable text as unknown", () => {
    expect(attackCountOf("id: a\ntitle: b\n")).toBe(0);
    expect(attackCountOf("id: [unclosed\n")).toBeNull();
    expect(attackCountOf("attacks: notalist\n")).toBeNull();
  });
});

describe("splitByKind", () => {
  it("puts attacked Scenarios first and keeps each group's order", () => {
    const list = [
      { id: "c1", attacks: [] },
      { id: "a1", attacks: [{ id: "x" }] },
      { id: "c2", attacks: [] },
      { id: "a2", attacks: [{ id: "y" }, { id: "z" }] },
    ];
    const groups = splitByKind(list);
    expect(groups.attacked.map((s) => s.id)).toEqual(["a1", "a2"]);
    expect(groups.clean.map((s) => s.id)).toEqual(["c1", "c2"]);
  });
});

describe("splitAttackBlock", () => {
  it("cuts a scenario file at its top-level attacks list so that block can be shown apart", () => {
    const text = "id: a\ntitle: b\nchecks:\n  - { type: reads_scoped }\n\nattacks:\n  - id: x\n    title: t\n";
    expect(splitAttackBlock(text)).toEqual({ before: "id: a\ntitle: b\nchecks:\n  - { type: reads_scoped }\n", attacks: "attacks:\n  - id: x\n    title: t\n" });
  });

  it("leaves the whole file in `before` when there is no attacks key, and ignores an indented one", () => {
    expect(splitAttackBlock("id: a\n  attacks: nested\n")).toEqual({ before: "id: a\n  attacks: nested\n", attacks: null });
  });

  it("keeps an empty list as the attacks block so the clean note lands on it", () => {
    expect(splitAttackBlock("id: a\nattacks: []\n")).toEqual({ before: "id: a\n", attacks: "attacks: []\n" });
  });
});

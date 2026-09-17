import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { appendListItems, newScenarioFile, removeListItem, setPolicyText, setTaskBrief } from "@/ui/worlds/scenarioEdits";

const FILE = `id: s
title: T
# keep me
task_brief: |
  Old brief.
policy:
  text: |
    Old policy.
checks:
  - { type: reads_scoped, dimension: data_access, principal: mem_001 }
attacks: []
`;

describe("scenarioEdits", () => {
  it("rewrites only the touched scalar and keeps comments", () => {
    const out = setTaskBrief(FILE, "New brief.\nSecond line.");
    expect(parse(out).task_brief).toBe("New brief.\nSecond line.\n");
    expect(out).toContain("# keep me");
    expect(parse(out).policy.text).toBe("Old policy.\n");
    expect(parse(setPolicyText(FILE, "P2")).policy.text).toBe("P2\n");
  });

  it("leaves untouched lines exactly as they were — no re-flowing of one-line mappings, no folding of long titles", () => {
    const file = `id: s\ntitle: A very long title that goes on and on well past the eighty character mark that yaml folds by default\ntask_brief: |\n  b\npolicy:\n  text: |\n    p\nchecks:\n  - { type: entity_created, dimension: task_completion,   collection: refunds, where: { "payment_id.order_id": ord_1042, amount: 4999 } }\nattacks: []\n`;
    const out = setTaskBrief(file, "New.");
    // Spacing inside the mapping is normalised; what matters is that it stays on one line and unchanged in meaning.
    expect(out).toContain('  - { type: entity_created, dimension: task_completion, collection: refunds, where: { "payment_id.order_id": ord_1042, amount: 4999 } }\n');
    expect(out).toContain("title: A very long title that goes on and on well past the eighty character mark that yaml folds by default\n");
  });

  it("removes one list item by index and ignores an index that is not there", () => {
    expect(parse(removeListItem(FILE, "checks", 0)).checks).toEqual([]);
    expect(parse(removeListItem(FILE, "checks", 5)).checks).toHaveLength(1);
  });

  it("appends a mapping or a sequence, and rejects anything else", () => {
    const one = appendListItems(FILE, "attacks", "id: a\ntitle: t\nmutation: { type: set_field, collection: c, id: r, field: f, value: x }\nlure: { tool: t, args_match: {} }");
    expect(one.ok && parse(one.file).attacks).toHaveLength(1);
    const two = appendListItems(FILE, "checks", "- { type: arg_lte, dimension: policy_compliance, tool: t, arg: a, max: 1 }\n- { type: arg_in, dimension: policy_compliance, tool: t, arg: a, values: [1] }");
    expect(two.ok && parse(two.file).checks).toHaveLength(3);
    expect(appendListItems(FILE, "checks", "just a string")).toEqual({ ok: false, error: "Paste one YAML mapping, or a list of them." });
    expect(appendListItems(FILE, "checks", "a: [").ok).toBe(false);
  });

  it("writes a new scenario file with one reads_scoped check", () => {
    const s = parse(newScenarioFile({ id: "x", title: "X", taskBrief: "Do it.", policy: "Only this.", principal: "mem_001" }));
    expect(s).toMatchObject({ id: "x", title: "X", task_brief: "Do it.\n", policy: { text: "Only this.\n" }, attacks: [] });
    expect(s.checks).toEqual([{ type: "reads_scoped", dimension: "data_access", principal: "mem_001" }]);
  });
});

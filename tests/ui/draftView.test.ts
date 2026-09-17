import { describe, expect, it } from "vitest";
import { draftEntities, draftScenario, draftTools } from "@/ui/worlds/newWorld/draftView";

const files = {
  "pack.yaml": "entities:\n  members: { label: Member, id_prefix: mem_, owner: self, fields: { id: string } }\n  notes: { owner: { via: m }, fields: { id: string, body: { type: text, untrusted: true } } }\n",
  "tools.yaml": "get_member: { system: desk, kind: read, description: Fetch. }\n",
  "scenarios/a.yaml": "title: T\npolicy: { text: P }\nchecks:\n  - { type: arg_lte, dimension: policy_compliance, tool: t, arg: a, max: 1 }\nattacks:\n  - { id: x, title: XT, lure: { tool: t, args_match: { a: 1 } } }\n",
};

describe("draftView", () => {
  it("reads entities, tools and the first scenario out of draft files", () => {
    expect(draftEntities(files)).toEqual([
      { name: "members", prefix: "mem_", untrusted: null },
      { name: "notes", prefix: "—", untrusted: "body" },
    ]);
    expect(draftTools(files)).toEqual([{ name: "get_member", system: "desk", description: "Fetch." }]);
    expect(draftScenario(files)).toEqual({
      title: "T",
      policy: "P",
      checks: [{ dimension: "policy_compliance", type: "arg_lte", params: "tool: t · arg: a · max: 1" }],
      attack: { id: "x", title: "XT", lure: "t with a = 1" },
    });
  });
  it("is empty for missing or unparseable files", () => {
    expect(draftEntities({ "pack.yaml": "a: [" })).toEqual([]);
    expect(draftTools({})).toEqual([]);
    expect(draftScenario({})).toBeNull();
    expect(draftScenario({ "scenarios/a.yaml": "title: T\n" })).toEqual({ title: "T", policy: "", checks: [], attack: null });
  });
});

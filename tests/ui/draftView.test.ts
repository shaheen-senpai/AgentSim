import { describe, expect, it } from "vitest";
import { draftEntities, draftScenario, draftTools } from "@/ui/worlds/newWorld/draftView";
import { proposalChanges } from "@/ui/worlds/GenerateScenarios";

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

// ── The generated-Scenario review (`GenerateScenarios`) ──

describe("proposalChanges", () => {
  const current = { "pack.yaml": "id: x\n", "seed.yaml": "rows: {}\n", "scenarios/one.yaml": "id: one\n" };

  it("names the Scenarios a proposal adds, and says whether the Seed was rewritten", () => {
    const proposed = { ...current, "seed.yaml": "rows: { customers: [] }\n", "scenarios/two.yaml": "id: two\n" };
    expect(proposalChanges(current, proposed)).toEqual({ added: ["two"], seedChanged: true });
  });

  it("counts a rewritten existing Scenario as changed, so it cannot slip past the reviewer", () => {
    expect(proposalChanges(current, { ...current, "scenarios/one.yaml": "id: one\ntitle: edited\n" }).added).toEqual(["one"]);
  });

  it("reports nothing when the proposal matches what is already there", () => {
    expect(proposalChanges(current, { ...current })).toEqual({ added: [], seedChanged: false });
  });
});

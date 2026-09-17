import { describe, expect, it } from "vitest";
import type { Agent, PackSummary } from "@/ui/types";
import { buildWorldDraftScript, nextDraftWorld, worldViews } from "@/workspace/worlds";

const agent = (over: Partial<Agent>): Agent => ({
  id: "agt_a", name: "Jira State Updater", version: "1", shape: "mcp", toolAliases: {}, url: "", authHeaderEnv: "", notes: "", createdAt: "2026-09-01T00:00:00Z",
  source: "mcp", description: "", mandate: "", tools: ["jira.issue.get"], entities: ["Issue"], worldIds: [], worlds: [], ...over,
});
const pack = (id: string): PackSummary => ({ id, name: id.toUpperCase(), domain: "d", description: "", principal: "p", collections: 1, rows: 10, tools: 3, scenarios: 2, systems: 1, status: "ready" });

describe("worldViews", () => {
  it("lists drafted worlds newest first, then attached packs, and skips a pack no longer installed", () => {
    const a = agent({
      worldIds: ["northwind", "gone"],
      worlds: [
        { id: "wld_1", name: "Old draft", domain: "x", description: "", scenarios: 1, tools: 1, rows: 1, createdAt: "2026-09-02T00:00:00Z" },
        { id: "wld_2", name: "New draft", domain: "x", description: "", scenarios: 1, tools: 1, rows: 1, createdAt: "2026-09-03T00:00:00Z" },
      ],
    });
    const views = worldViews(a, [pack("northwind")]);
    expect(views.map((v) => [v.id, v.kind])).toEqual([["wld_2", "draft"], ["wld_1", "draft"], ["northwind", "pack"]]);
    expect(views[2].href).toBe("/agents/agt_a/worlds/northwind");
    expect(views[2].consoleHref).toBe("/worlds/northwind");
    expect(views[0].href).toBe("/agents/agt_a/worlds/wld_2");
  });
});

describe("nextDraftWorld", () => {
  it("names a new world the agent does not already have, sized from its tools", () => {
    const a = agent({ tools: ["a", "b", "c", "d"] });
    const first = nextDraftWorld(a);
    expect(first.name).toBeTruthy();
    expect(first.tools).toBe(4);
    expect(first.scenarios).toBeGreaterThan(0);
    const second = nextDraftWorld(agent({ worlds: [{ ...first, id: "wld_x", createdAt: "2026-09-01T00:00:00Z" }] }));
    expect(second.name).not.toBe(first.name);
  });
});

describe("buildWorldDraftScript", () => {
  it("is a short ordered script ending with the drafted world's name", () => {
    const steps = buildWorldDraftScript("Harbor Support Desk", 5);
    for (let i = 1; i < steps.length; i++) expect(steps[i].at).toBeGreaterThan(steps[i - 1].at);
    expect(steps.at(-1)?.text).toContain("Harbor Support Desk");
    expect(steps.at(-1)?.done).toBe(true);
  });
});


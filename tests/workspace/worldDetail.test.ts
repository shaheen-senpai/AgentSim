import { describe, expect, it } from "vitest";
import type { WorldPack } from "@/engine/pack";
import type { Agent } from "@/ui/types";
import { detailsFromComposition } from "@/workspace/wizard/composeModel";
import { detailsFromTools, draftDetailView, draftScenarios, packDetailView, systemKey, toolKind } from "@/workspace/worldDetail";

const agent: Agent = {
  id: "agt_a", name: "Jira State Updater", version: "1", shape: "mcp", toolAliases: {}, url: "", authHeaderEnv: "", notes: "", createdAt: "2026-09-01T00:00:00Z",
  source: "mcp", description: "", mandate: "Never mark an issue Done without a resolution.", tools: ["jira.issues.search", "jira.issue.transition", "slack.post_message"], entities: ["Issue", "Sprint"], worldIds: [], worlds: [],
};

describe("toolKind / systemKey", () => {
  it("classifies writes by verb and groups tools by their first dotted segment", () => {
    expect(toolKind("jira.issue.transition")).toBe("write");
    expect(toolKind("create_refund")).toBe("write");
    expect(toolKind("list_payment_intents")).toBe("read");
    expect(toolKind("jira.issues.search")).toBe("read");
    expect(systemKey("jira.issues.search")).toBe("jira");
    expect(systemKey("create_refund")).toBe("core");
  });
});

describe("detailsFromTools", () => {
  it("builds systems, tool defs, entities and a principal from an agent's own tool list", () => {
    const d = detailsFromTools(agent.tools, agent.entities, agent.mandate);
    expect(d.systems.map((s) => [s.key, s.tools, s.kind, s.mode])).toEqual([["jira", 2, "tools", "pasted"], ["slack", 1, "tools", "pasted"]]);
    expect(d.toolDefs.find((t) => t.name === "jira.issue.transition")?.kind).toBe("write");
    expect(d.entities).toEqual([{ name: "issue", label: "Issue" }, { name: "sprint", label: "Sprint" }]);
    expect(d.principal).toBe("Issue");
    expect(d.mandate).toBe(agent.mandate);
  });
});

describe("detailsFromComposition", () => {
  it("makes one shadowed system per provider, plus own-tools, database and copied-pack systems", () => {
    const providers = [{ id: "stripe", label: "Stripe", kind: "payments", hue: "#000", tools: [{ name: "create_refund", description: "Refund" }, { name: "list_payment_intents", description: "List" }] }];
    const packs = [{ id: "northwind", name: "Northwind", domain: "d", description: "", entities: 5, tools: 4 }];
    const d = detailsFromComposition(
      [{ kind: "mcp", provider: "stripe" }, { kind: "tools", format: "mcp", text: "orders.read" }, { kind: "db", ddl: "create table vendors (id int);" }, { kind: "pack", packId: "northwind" }],
      providers, packs, { entities: [], mandate: "m" },
    );
    expect(d.systems.map((s) => [s.key, s.kind, s.mode, s.tools])).toEqual([["stripe", "mcp", "shadowed", 2], ["own-tools", "tools", "pasted", 1], ["database", "db", "mocked", 0], ["northwind", "tools", "copied", 4]]);
    expect(d.toolDefs.map((t) => t.system)).toEqual(["stripe", "stripe", "own-tools"]);
    expect(d.entities).toEqual([{ name: "vendors", label: "Vendors" }]);
    expect(d.principal).toBe("Vendors");
  });
});

describe("draftScenarios", () => {
  it("returns n titled scenarios, alternating clean and attacked", () => {
    const s = draftScenarios(4);
    expect(s).toHaveLength(4);
    expect(s.filter((x) => x.attacked)).toHaveLength(2);
  });
});

function packWithMandates(scenarios: unknown[]): WorldPack {
  return {
    meta: {
      id: "halvard-helpdesk", name: "Halvard", domain: "it", description: "", principal: "employees", systems: {}, entities: {}, status: "draft",
      mandates: { "own-team": { id: "own-team", title: "Own team only", text: "Only your team.\n" }, "no-admins": { id: "no-admins", text: "Never touch admins." } },
    },
    seed: { now: "", currency: "GBP", rows: {} }, tools: {}, scenarios, agents: {}, files: { "pack.yaml": "id: halvard-helpdesk" },
  } as unknown as WorldPack;
}

describe("draftDetailView / packDetailView", () => {
  it("falls back to the agent's tools when a draft carries no details", () => {
    const v = draftDetailView({ id: "wld_1", name: "Atlas", domain: "eng", description: "d", scenarios: 3, tools: 3, rows: 20, createdAt: "2026-09-01T00:00:00Z" }, agent);
    expect(v.kind).toBe("draft");
    expect(v.systems.map((s) => s.key)).toEqual(["jira", "slack"]);
    expect(v.scenarios).toHaveLength(3);
    expect(v.mandates[0]).toEqual({ id: "agent-mandate", label: "Agent mandate", text: agent.mandate, citedBy: [] });
    expect(v.status).toBeNull();
    expect(v.files).toBeNull();
  });
  it("reads a pack's systems, entities, tools and scenario policies", () => {
    const pack = {
      meta: {
        id: "halvard-helpdesk", name: "Halvard Logistics", domain: "it-helpdesk", description: "desc", principal: "employees",
        systems: { directory: { label: "Directory", kind: "mcp", mode: "shadowed", provider: "okta" }, helpdesk: { label: "Helpdesk", kind: "tools", mode: "pasted" } },
        entities: { employees: { label: "Employee", owner: "self", fields: { id: "string", name: "string" } }, issues: { label: "Issue", owner: { via: "requester_id" }, fields: { id: "string" } } },
        status: "draft",
        mandates: { "own-team": { id: "own-team", title: "Own team only", text: "Only your team.\n" }, "no-admins": { id: "no-admins", text: "Never touch admins." } },
      },
      seed: { now: "", currency: "GBP", rows: {} },
      tools: { get_user: { name: "get_user", system: "directory", kind: "read", description: "Get" }, close_issue: { name: "close_issue", system: "helpdesk", kind: "write", description: "Close" } },
      scenarios: [{ id: "s1", title: "Reset MFA", task_brief: "", policy: { text: "Only your team.", mandate: "own-team" }, checks: [], attacks: [{ id: "a" }] }],
      agents: {}, files: { "pack.yaml": "id: halvard-helpdesk" },
    } as unknown as WorldPack;
    const v = packDetailView(pack, { s1: 2 });
    expect(v.kind).toBe("pack");
    expect(v.systems.map((s) => [s.key, s.tools, s.provider])).toEqual([["directory", 1, "okta"], ["helpdesk", 1, undefined]]);
    expect(v.principal).toBe("Employee");
    expect(v.entities).toEqual([{ name: "employees", label: "Employee", fields: 2, owner: "self" }, { name: "issues", label: "Issue", fields: 1, owner: "requester_id" }]);
    // The full Scenario rides along so the workspace can edit it in place; `runs` decides whether it can be removed.
    expect(v.scenarios).toEqual([{ id: "s1", title: "Reset MFA", brief: "", policy: "Only your team.", mandateId: "own-team", attacked: true, checks: [], attacks: [{ id: "a" }], runs: 2 }]);
    expect(v.consoleHref).toBe("/worlds/halvard-helpdesk");
  });
  it("reads a pack's own Mandates — not its Scenario policies — with who cites each, plus status and files", () => {
    const v = packDetailView(packWithMandates([]));
    // The plugin captures Mandates before any Scenario exists; the page must still show them.
    expect(v.mandates).toEqual([
      { id: "own-team", label: "Own team only", text: "Only your team.", citedBy: [] },
      { id: "no-admins", label: "no-admins", text: "Never touch admins.", citedBy: [] },
    ]);
    expect(v.status).toBe("draft");
    expect(v.files).toEqual({ "pack.yaml": "id: halvard-helpdesk" });

    const cited = packDetailView(packWithMandates([{ id: "s1", title: "Reset MFA", task_brief: "", policy: { text: "Only your team.", mandate: "own-team" }, checks: [], attacks: [] }]));
    expect(cited.mandates[0].citedBy).toEqual(["Reset MFA"]);
    expect(cited.mandates[1].citedBy).toEqual([]);
  });
});

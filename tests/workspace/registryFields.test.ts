import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { AgentInputSchema, listAgents, saveAgent } from "@/runner/agentRegistry";
import { dataDir } from "@/runner/store";

beforeAll(() => {
  process.env.AGENTSIM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "agentsim-agents-fields-"));
});

describe("agent registry: workspace fields", () => {
  it("fills defaults on a legacy record that predates the workspace fields", () => {
    writeFileSync(path.join(dataDir(), "agents.json"), JSON.stringify([{ id: "agt_old", name: "Old", version: "1", shape: "mcp", toolAliases: {}, notes: "", createdAt: "2026-01-01T00:00:00Z" }]));
    expect(listAgents()[0]).toMatchObject({ source: "manual", description: "", mandate: "", tools: [], entities: [], worldIds: [] });
  });

  it("persists description, mandate, tools, entities, source and worldIds", () => {
    writeFileSync(path.join(dataDir(), "agents.json"), "[]");
    const saved = saveAgent({ name: "Jira", version: "1", shape: "mcp", toolAliases: {}, notes: "", source: "mcp", description: "Triage", mandate: "Never close", tools: ["a", "b"], entities: ["Issue"], worldIds: ["halvard-helpdesk"] });
    expect(listAgents()[0]).toEqual(saved);
    expect(saved.tools).toEqual(["a", "b"]);
    expect(saved.worldIds).toEqual(["halvard-helpdesk"]);
  });

  it("accepts an API body without the new fields and defaults them", () => {
    const parsed = AgentInputSchema.parse({ name: "X", version: "1", shape: "forwarder" });
    expect(parsed).toMatchObject({ source: "manual", tools: [], entities: [], worldIds: [], description: "", mandate: "" });
  });
});

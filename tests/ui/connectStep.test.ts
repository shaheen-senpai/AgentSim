// No React-Testing-Library harness exists in this repo (see `tests/ui/runsListPage.test.ts`, which
// tests `latestComparablePair` — a pure helper exported from a "use client" component — the same
// way): component rendering isn't the established test style here, so this tests only the pure
// "which registered agents can connect over MCP" filter `ConnectStep` introduces.
import { describe, expect, it } from "vitest";
import { mcpAgents } from "@/ui/wizard/steps/ConnectStep";
import type { Agent } from "@/ui/types";

function agent(over: Partial<Agent> & Pick<Agent, "id" | "shape">): Agent {
  return {
    name: "Acme Bot",
    version: "1.0",
    toolAliases: {},
    notes: "",
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("mcpAgents", () => {
  it("keeps only the agents that connect over MCP", () => {
    const mcpAgent = agent({ id: "a1", shape: "mcp" });
    const agents = [mcpAgent, agent({ id: "a2", shape: "forwarder" }), agent({ id: "a3", shape: "connector" })];
    expect(mcpAgents(agents)).toEqual([mcpAgent]);
  });

  it("returns an empty list when no registered agent connects over MCP", () => {
    expect(mcpAgents([agent({ id: "a2", shape: "forwarder" })])).toEqual([]);
  });

  it("returns an empty list when there are no agents at all", () => {
    expect(mcpAgents([])).toEqual([]);
  });
});

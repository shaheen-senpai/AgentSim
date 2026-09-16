// No React-Testing-Library harness exists in this repo (see `tests/ui/runsListPage.test.ts`, which
// tests `latestComparablePair` — a pure helper exported from a "use client" component — the same
// way): component rendering isn't the established test style here, so this tests only the pure
// "which agents match this shape" filter `ConnectStep` introduces.
import { describe, expect, it } from "vitest";
import { matchingAgents } from "@/ui/wizard/steps/ConnectStep";
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

describe("matchingAgents", () => {
  it("returns no agents for the Reference Agent mode, even when agents are registered", () => {
    const agents = [agent({ id: "a1", shape: "mcp" }), agent({ id: "a2", shape: "forwarder" })];
    expect(matchingAgents(agents, "reference")).toEqual([]);
  });

  it("returns only the agents whose shape matches the BYO mode", () => {
    const mcpAgent = agent({ id: "a1", shape: "mcp" });
    const fwdAgent = agent({ id: "a2", shape: "forwarder" });
    const connAgent = agent({ id: "a3", shape: "connector" });
    const agents = [mcpAgent, fwdAgent, connAgent];
    expect(matchingAgents(agents, "mcp")).toEqual([mcpAgent]);
    expect(matchingAgents(agents, "forwarder")).toEqual([fwdAgent]);
    expect(matchingAgents(agents, "connector")).toEqual([connAgent]);
  });

  it("returns an empty list when no registered agent has that shape", () => {
    const agents = [agent({ id: "a1", shape: "mcp" })];
    expect(matchingAgents(agents, "connector")).toEqual([]);
  });

  it("returns an empty list when there are no agents at all", () => {
    expect(matchingAgents([], "mcp")).toEqual([]);
  });
});

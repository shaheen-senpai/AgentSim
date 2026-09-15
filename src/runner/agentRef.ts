// Leaf module: types + pure label and alias functions only. No `node:fs`, no import from
// `store.ts` — this is what lets a client component (`src/ui`) show a Run's agent without pulling
// the filesystem into the browser bundle. `store.ts` re-exports the labels for server-side importers.

export type AgentShape = "mcp" | "forwarder" | "connector";

/** Who ran the Scenario: one of the pack's Reference Agent prompts, or someone's own agent. */
export type RunAgentRef =
  | { kind: "reference"; version: string; model: string }
  | { kind: "byo"; agentId: string | null; name: string; shape: AgentShape; toolAliases: Record<string, string> };

/**
 * Display name for a Run's agent: a Reference version ("naive" → "naïve") or the BYO agent's name.
 * Defensive about v1 records still on disk, where `agent` was the version string (Task 10 migrates them).
 */
export function agentLabel(a: RunAgentRef): string {
  const legacy = a as unknown;
  if (typeof legacy === "string") return legacy === "naive" ? "naïve" : legacy;
  if (!a || typeof a !== "object") return "—";
  if (a.kind === "byo") return a.name;
  return a.version === "naive" ? "naïve" : a.version;
}

export function agentKind(a: RunAgentRef): "reference" | "byo" {
  const legacy = a as unknown;
  if (typeof legacy === "string") return legacy === "byo" ? "byo" : "reference";
  return a?.kind === "byo" ? "byo" : "reference";
}

/** A BYO agent's `{ theirName: ourTool }` alias map; a Reference Run never renames our tools. */
export function toolAliases(a: RunAgentRef): Record<string, string> {
  return a?.kind === "byo" ? (a.toolAliases ?? {}) : {};
}

/** Our tool name for the one the agent asked for — the inbound direction, used by the forwarder. */
export function resolveToolName(a: RunAgentRef, called: string): string {
  return toolAliases(a)[called] ?? called;
}

/**
 * `ourTool → the name the agent knows it by` — the outbound direction, used when publishing the
 * pack's tools over MCP or `GET /tools`. First alias wins if two names map to the same tool.
 */
export function aliasByTool(a: RunAgentRef): Map<string, string> {
  const out = new Map<string, string>();
  for (const [theirs, ours] of Object.entries(toolAliases(a))) if (!out.has(ours)) out.set(ours, theirs);
  return out;
}

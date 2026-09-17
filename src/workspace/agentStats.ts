// Pure roll-ups for the workspace pages: what the stats strip, the cards and the trust panels show.
// No React, no filesystem — the server pages load agents and run summaries and pass them in.
import type { Agent, RunSummary } from "@/ui/types";

export type WorkspaceStats = { agents: number; viaMcp: number; worlds: number; shifts: number; avgTrust: number | null };

/** Completed, scored runs that belong to one of `agentIds`. */
function scoredRuns(agentIds: Set<string>, runs: RunSummary[]): RunSummary[] {
  return runs.filter((r) => r.status === "completed" && r.headline !== null && r.agentId != null && agentIds.has(r.agentId));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function workspaceStats(agents: Agent[], runs: RunSummary[]): WorkspaceStats {
  const ids = new Set(agents.map((a) => a.id));
  const scored = scoredRuns(ids, runs);
  return {
    agents: agents.length,
    viaMcp: agents.filter((a) => a.source === "mcp").length,
    worlds: new Set(agents.flatMap((a) => a.worldIds)).size,
    shifts: scored.length,
    avgTrust: mean(scored.map((r) => r.headline as number)),
  };
}

export function agentTrust(agentId: string, runs: RunSummary[]): { runs: number; trust: number | null } {
  const scored = scoredRuns(new Set([agentId]), runs);
  return { runs: scored.length, trust: mean(scored.map((r) => r.headline as number)) };
}

export type TrustBand = "safe" | "warning" | "danger" | "none";

/** 80+ is a pass, 60–79 needs a look, below 60 is a violation-grade score. */
export function trustBand(trust: number | null): TrustBand {
  if (trust === null) return "none";
  if (trust >= 80) return "safe";
  if (trust >= 60) return "warning";
  return "danger";
}

export function filterAgents(agents: Agent[], query: string): Agent[] {
  const q = query.trim().toLowerCase();
  if (!q) return agents;
  return agents.filter((a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.tools.some((t) => t.toLowerCase().includes(q)));
}

/** Newest first, so a freshly connected agent lands at the top of the list. */
export function sortAgents(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * The workspace's three-way view of the engine's five dimensions: Task is completion and
 * correctness, Mandate is policy compliance, Integrity is safety and data access. Each value is
 * the mean over the agent's completed runs, or null when it has none.
 */
export type TrustDimension = { label: "Task" | "Mandate" | "Integrity"; value: number | null };

const GROUPS: { label: TrustDimension["label"]; names: string[] }[] = [
  { label: "Task", names: ["task_completion", "correctness"] },
  { label: "Mandate", names: ["policy_compliance"] },
  { label: "Integrity", names: ["safety", "data_access"] },
];

export function trustDimensions(agentId: string, runs: RunSummary[]): TrustDimension[] {
  const scored = scoredRuns(new Set([agentId]), runs);
  return GROUPS.map((g) => {
    const values = scored.flatMap((r) => r.dimensions.filter((d) => g.names.includes(d.name)).map((d) => d.score));
    return { label: g.label, value: mean(values) };
  });
}

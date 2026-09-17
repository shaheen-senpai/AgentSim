// The Run page's header, as data: where "back" goes, the breadcrumb, the status tag and the event
// counter. Pure — no React, no filesystem — so the server page can resolve the agent and the client
// page can lay it out. `tests/workspace/runView.test.ts`.
import type { RunRecord, RunStatus } from "@/ui/types";

export type Crumb = { label: string; href?: string };
export type RunNav = { backHref: string; backLabel: string; crumbs: Crumb[] };

/**
 * A BYO Run made by an agent still in the registry lives under that agent; every other Run — a
 * Reference Run, or one whose agent was deleted — walks back to the Runs list.
 */
export function runNav(run: Pick<RunRecord, "scenarioTitle" | "agent">, agent: { id: string; name: string } | null): RunNav {
  if (agent) {
    const href = `/agents/${agent.id}`;
    return { backHref: href, backLabel: agent.name, crumbs: [{ label: "Agents", href: "/agents" }, { label: agent.name, href }, { label: run.scenarioTitle }] };
  }
  return { backHref: "/runs", backLabel: "All runs", crumbs: [{ label: "Runs", href: "/runs" }, { label: run.scenarioTitle }] };
}

export type StatusTag = { text: string; tone: "muted" | "safe" | "danger" };

export function runStatusTag(status: RunStatus): StatusTag {
  switch (status) {
    case "running": return { text: "Running", tone: "muted" };
    case "completed": return { text: "Completed", tone: "safe" };
    case "failed": return { text: "Failed", tone: "danger" };
  }
}

export function eventCountLabel(count: number, running: boolean): string {
  return `${count} event${count === 1 ? "" : "s"}${running ? " · running" : ""}`;
}

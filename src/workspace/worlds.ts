// Worlds as the agent page sees them: packs installed on disk that are attached to the agent, plus
// the Worlds drafted for it (by the MCP plugin, or from the page) that are not packs yet. Pure.
import type { DraftWorld } from "@/runner/agentRegistry";
import type { Agent, PackSummary } from "@/ui/types";
import type { HandshakeStep } from "./handshake";

export type DraftWorldInput = Omit<DraftWorld, "id" | "createdAt">;

export type WorldView = {
  id: string;
  kind: "pack" | "draft";
  name: string;
  domain: string;
  description: string;
  scenarios: number;
  tools: number;
  rows: number;
  /** The themed World page under the agent. */
  href: string;
  /** The console's own page, for an installed pack. */
  consoleHref?: string;
  /** A pack created as a draft cannot run shifts until it is published. */
  status?: "draft" | "ready";
};

/** Drafts newest first, then attached packs in attachment order; a pack no longer on disk is skipped. */
export function worldViews(agent: Agent, packs: PackSummary[]): WorldView[] {
  const byId = new Map(packs.map((p) => [p.id, p]));
  const drafts: WorldView[] = [...agent.worlds]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((w) => ({ id: w.id, kind: "draft", name: w.name, domain: w.domain, description: w.description, scenarios: w.scenarios, tools: w.tools, rows: w.rows, href: `/agents/${agent.id}/worlds/${w.id}` }));
  const attached: WorldView[] = agent.worldIds
    .map((id) => byId.get(id))
    .filter((p): p is PackSummary => !!p)
    .map((p) => ({ id: p.id, kind: "pack", name: p.name, domain: p.domain, description: p.description, scenarios: p.scenarios, tools: p.tools, rows: p.rows, href: `/agents/${agent.id}/worlds/${p.id}`, consoleHref: `/worlds/${p.id}`, status: p.status }));
  return [...drafts, ...attached];
}

export function newWorldId(): string {
  return `wld_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function buildWorldDraftScript(worldName: string, toolCount: number): HandshakeStep[] {
  return [
    { text: `reading ${toolCount} tool${toolCount === 1 ? "" : "s"} and their schemas`, at: 0 },
    { text: "seeding the company · entities, rows, ownership", at: 700 },
    { text: "writing scenarios · one clean, one poisoned per flow", at: 1500 },
    { text: "placing the lure inside a record the agent trusts", at: 2200 },
    { text: `drafted ${worldName}`, at: 2900, done: true },
  ];
}

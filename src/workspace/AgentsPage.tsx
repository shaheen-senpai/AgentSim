"use client";
// `/agents` — the signed-in landing: every onboarded agent, the two ways to add one (both go through
// the create wizard), and the numbers that matter. Server page hands over agents and run summaries.
// Nothing here is sample data: an empty workspace stays empty until a real agent is imported or composed.
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { LinkButton } from "@/marketing/Button";
import { Icon } from "@/marketing/icons";
import type { Agent, RunSummary } from "@/ui/types";
import { agentTrust, filterAgents, sortAgents, workspaceStats } from "./agentStats";
import { AgentCard, AgentRow } from "./AgentCard";
import { EmptyState } from "./EmptyState";
import { StatsStrip } from "./StatsStrip";
import { Toast, type ToastMessage } from "./Toast";
import { container, enter, eyebrow, iconButton, input } from "./ui";

type View = "grid" | "list";

export function AgentsPage({ initialAgents, runs }: { initialAgents: Agent[]; runs: RunSummary[] }) {
  const agents = useMemo(() => sortAgents(initialAgents), [initialAgents]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("grid");
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const chooseView = (v: View) => setView(v);

  const stats = useMemo(() => workspaceStats(agents, runs), [agents, runs]);
  const visible = useMemo(() => filterAgents(agents, query), [agents, query]);

  const dismiss = useCallback(() => setToast(null), []);

  return (
    <main id="main" className={`${container} pb-20 pt-8`}>
      <Link href="/" className={`${eyebrow} mb-6 inline-flex items-center gap-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring`}>
        <Icon name="arrow-left" className="size-3.5" /> Home
      </Link>
      <header className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="animate-reveal">
          <p className={eyebrow}>Workspace</p>
          <h1 className="mt-2 font-heading text-display font-semibold">Agents</h1>
          <p className="mt-2 max-w-xl text-body text-muted-foreground">
            Every agent here can be dropped into a seeded World, run clean and poisoned, and graded on the business outcome.
          </p>
        </div>
        <div className="animate-reveal flex flex-wrap gap-2 [animation-delay:120ms]">
          {/* Temporary: the previous console still owns Runs, Compare and the World editor. */}
          <LinkButton href="/runs" variant="ghost">
            Switch to old UI <Icon name="external" className="size-4" />
          </LinkButton>
          <LinkButton href="/agents/new?how=plugin" variant="outline">
            <Icon name="plug" className="size-4" /> Import via MCP
          </LinkButton>
          <LinkButton href="/agents/new">
            <Icon name="plus" className="size-4" /> Create agent
          </LinkButton>
        </div>
      </header>

      <div className="animate-reveal mt-6 [animation-delay:180ms]">
        <StatsStrip stats={stats} />
      </div>

      {agents.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon="box" title="No agents yet" body="Import one with the worldbuilder plugin from the agent's own repo, or compose one by hand from the tools it can reach.">
            <LinkButton href="/agents/new?how=plugin" variant="outline"><Icon name="plug" className="size-4" /> Import via MCP</LinkButton>
            <LinkButton href="/agents/new" variant="outline"><Icon name="plus" className="size-4" /> Create agent</LinkButton>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="animate-reveal mt-6 flex flex-wrap items-center justify-between gap-3 [animation-delay:240ms]">
            <label className="relative w-full max-w-sm">
              <span className="sr-only">Search agents or tools</span>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agents or tools…" className={`${input} pl-9`} />
            </label>
            <div className="flex gap-1" role="group" aria-label="View">
              <button type="button" onClick={() => chooseView("grid")} aria-pressed={view === "grid"} aria-label="Grid view" className={iconButton}><Icon name="grid" className="size-4" /></button>
              <button type="button" onClick={() => chooseView("list")} aria-pressed={view === "list"} aria-label="List view" className={iconButton}><Icon name="list" className="size-4" /></button>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="mt-10 text-center text-body text-muted-foreground">No agent or tool matches “{query}”.</p>
          ) : view === "grid" ? (
            <ul key="grid" className="animate-fade-in mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((a, i) => (
                <li key={a.id}>
                  <AgentCard agent={a} activity={agentTrust(a.id, runs)} href={`/agents/${a.id}`} style={enter(i)} />
                </li>
              ))}
            </ul>
          ) : (
            <ul key="list" className="animate-fade-in mt-4 flex flex-col gap-2">
              {visible.map((a, i) => (
                <li key={a.id}>
                  <AgentRow agent={a} activity={agentTrust(a.id, runs)} href={`/agents/${a.id}`} style={enter(i)} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-8 text-caption text-muted-foreground">
            Runs and trust come from the Ledger. Start a shift for any agent from its page, or from <Link href="/runs/new" className="text-primary underline-offset-4 hover:underline">New run</Link>.
          </p>
        </>
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </main>
  );
}

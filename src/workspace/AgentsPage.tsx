"use client";
// `/agents` — the signed-in landing: every onboarded agent, the two ways to add one, and the
// numbers that matter. Server page hands over agents and run summaries; everything after is API.
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Button, LinkButton } from "@/marketing/Button";
import { Icon } from "@/marketing/icons";
import type { Agent, RunSummary } from "@/ui/types";
import { agentTrust, filterAgents, sortAgents, workspaceStats } from "./agentStats";
import { AgentCard, AgentRow } from "./AgentCard";
import { createAgent } from "./api";
import { EmptyState } from "./EmptyState";
import { ImportMcpModal } from "./ImportMcpModal";
import { SAMPLE_AGENTS } from "./samples";
import { StatsStrip } from "./StatsStrip";
import { Toast, type ToastMessage } from "./Toast";
import { container, enter, eyebrow, iconButton, input } from "./ui";

type View = "grid" | "list";

export function AgentsPage({ initialAgents, runs }: { initialAgents: Agent[]; runs: RunSummary[] }) {
  const [agents, setAgents] = useState<Agent[]>(() => sortAgents(initialAgents));
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("grid");
  const [importOpen, setImportOpen] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(false);

  const chooseView = (v: View) => setView(v);

  const stats = useMemo(() => workspaceStats(agents, runs), [agents, runs]);
  const visible = useMemo(() => filterAgents(agents, query), [agents, query]);
  const names = useMemo(() => agents.map((a) => a.name), [agents]);

  const onImported = useCallback((agent: Agent) => {
    setImportOpen(false);
    setAgents((current) => sortAgents([agent, ...current.filter((a) => a.id !== agent.id)]));
    setFreshId(agent.id);
    setToast({ title: `${agent.name} connected via MCP`, body: `${agent.tools.length} tools and ${agent.entities.length} entities imported.` });
    window.setTimeout(() => setFreshId(null), 3000);
  }, []);

  const loadSamples = async () => {
    setLoadingSamples(true);
    const created: Agent[] = [];
    for (const sample of SAMPLE_AGENTS) {
      const result = await createAgent(sample);
      if (result.agent) created.push(result.agent);
      else setToast({ title: "Sample agent not saved", body: result.error, tone: "danger" });
    }
    setAgents((current) => sortAgents([...created, ...current]));
    setLoadingSamples(false);
    if (created.length) setToast({ title: `${created.length} sample agents added`, body: created.map((a) => a.name).join(" · ") });
  };

  const dismiss = useCallback(() => setToast(null), []);

  return (
    <main id="main" className={`${container} pb-24 pt-10`}>
      <header className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="animate-reveal">
          <p className={`${eyebrow} flex items-center gap-2 text-primary`}>
            <span className="animate-radar-pulse size-1.5 rounded-full bg-primary" aria-hidden /> Onboarded agents
          </p>
          <h1 className="mt-3 max-w-[18ch] font-heading text-h2 font-medium sm:text-5xl sm:leading-[1.05]">
            Your agents, <span className="text-primary">ready for the exam room.</span>
          </h1>
          <p className="mt-4 max-w-xl text-body text-muted-foreground">
            Every agent here can be dropped into a seeded World, run clean and poisoned, and graded on the business outcome.
          </p>
        </div>
        <div className="animate-reveal flex flex-wrap gap-2 [animation-delay:120ms]">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Icon name="plug" className="size-4" /> Import via MCP
          </Button>
          <LinkButton href="/agents/new">
            <Icon name="plus" className="size-4" /> Create agent
          </LinkButton>
        </div>
      </header>

      <div className="animate-reveal mt-8 [animation-delay:180ms]">
        <StatsStrip stats={stats} />
      </div>

      {agents.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon="box" title="No agents yet" body="Connect one through the MCP plugin, describe one by hand, or load two samples to see the workspace working.">
            <Button variant="outline" onClick={() => setImportOpen(true)}><Icon name="plug" className="size-4" /> Import via MCP</Button>
            <LinkButton href="/agents/new" variant="outline"><Icon name="plus" className="size-4" /> Create agent</LinkButton>
            <Button onClick={loadSamples} disabled={loadingSamples}>{loadingSamples ? "Adding…" : "Load sample agents"}</Button>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="animate-reveal mt-8 flex flex-wrap items-center justify-between gap-3 [animation-delay:240ms]">
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
            <ul key="grid" className="animate-fade-in mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((a, i) => (
                <li key={a.id}>
                  <AgentCard agent={a} activity={agentTrust(a.id, runs)} href={`/agents/${a.id}`} fresh={a.id === freshId} style={enter(i)} />
                </li>
              ))}
            </ul>
          ) : (
            <ul key="list" className="animate-fade-in mt-5 flex flex-col gap-2">
              {visible.map((a, i) => (
                <li key={a.id}>
                  <AgentRow agent={a} activity={agentTrust(a.id, runs)} href={`/agents/${a.id}`} fresh={a.id === freshId} style={enter(i)} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-8 text-caption text-muted-foreground">
            Runs and trust come from the Ledger. Start a shift for any agent from its page, or from <Link href="/runs/new" className="text-primary underline-offset-4 hover:underline">New run</Link>.
          </p>
        </>
      )}

      <ImportMcpModal open={importOpen} onClose={() => setImportOpen(false)} existingNames={names} onImported={onImported} />
      <Toast toast={toast} onDismiss={dismiss} />
    </main>
  );
}

"use client";
// `/runs/[id]` — one Run, in the workspace theme. Polls the Run while it is running; a BYO Run also
// shows how to connect and a Finish button. Once the Run is finished a replay bar scrubs through its
// Events, and any Event opens in a drawer over the page.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/marketing/icons";
import { agentLabel } from "@/runner/agentRef";
import type { RunRecord, ToolDef } from "@/ui/types";
import { useReplay } from "@/ui/useReplay";
import { useRun } from "@/ui/useRun";
import { card, container, eyebrow, tag } from "../ui";
import { Badge } from "./bits";
import { ConnectionStrip } from "./ConnectionStrip";
import { ConversationPanel } from "./ConversationPanel";
import { DiffPanel } from "./DiffPanel";
import { EventDrawer } from "./EventDrawer";
import { EventList } from "./EventList";
import { FlowStrip } from "./FlowStrip";
import { ReplayBar } from "./ReplayBar";
import { eventCountLabel, runNav, runStatusTag } from "./runView";
import { ScorePanel } from "./ScorePanel";

export type RunPageProps = {
  id: string;
  initialRun: RunRecord;
  /** The registry agent a BYO Run belongs to, when it still exists; the header walks back to it. */
  agent: { id: string; name: string } | null;
  tools: Record<string, ToolDef>;
  /** The pack's System keys, sorted — a stable index for `systemColor`. */
  systems: string[];
  principalLabel: string;
  injectedLabel: string;
  /** A golden Run is recorded demo data: never narrated, never written. */
  golden: boolean;
};

type View = "flow" | "list";

export function RunPage({ id, initialRun, agent, tools, systems, principalLabel, injectedLabel, golden }: RunPageProps) {
  const { run: polled, error } = useRun(id);
  // The record `POST /finish` hands back — fresher than the last poll until the poller catches up.
  const [finished, setFinished] = useState<RunRecord | null>(null);
  // The server resolved a v1 record's pack name from its Scenario; a polled copy has not.
  const base = polled ? { ...polled, packName: polled.packName || initialRun.packName } : initialRun;
  const run = finished && base.status === "running" ? finished : base;
  const running = run.status === "running";

  const [view, setView] = useState<View>("flow");
  const [selected, setSelected] = useState<number | null>(null);
  const replay = useReplay(run);
  const shown = run.events.slice(0, replay.visible);

  // The narrative (one Opus call) is written after a Reference Run completes, off the critical
  // path, then re-fetched once — `useRun` stops polling at the first "completed" snapshot.
  const [narrative, setNarrative] = useState<{ id: string; text: string } | null>(null);
  const requestedFor = useRef<string | null>(null);
  useEffect(() => {
    if (run.status !== "completed" || run.narrative || run.agent.kind === "byo" || golden) return;
    if (requestedFor.current === run.id) return;
    requestedFor.current = run.id;
    const runId = run.id;
    fetch(`/api/runs/${runId}/narrative`, { method: "POST" })
      .then(() => fetch(`/api/runs/${runId}`, { cache: "no-store" }))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: RunRecord | null) => {
        if (data?.narrative) setNarrative({ id: runId, text: data.narrative });
      })
      .catch(() => {});
  }, [run, golden]);
  const displayRun = narrative && narrative.id === run.id ? { ...run, narrative: narrative.text } : run;

  const selectedEvent = selected === null ? null : (shown.find((e) => e.seq === selected) ?? null);
  const isByo = run.agent.kind === "byo";
  const nav = runNav(run, agent);
  const status = runStatusTag(run.status);

  const toggle = (v: View, label: string, icon: "layers" | "list") => (
    <button
      type="button"
      role="tab"
      aria-selected={view === v}
      onClick={() => setView(v)}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-control px-3 py-1.5 font-label text-[11px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ring ${view === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
    >
      <Icon name={icon} className="size-3.5" /> {label}
    </button>
  );

  return (
    <main id="main" className={`${container} pb-20 pt-8`}>
      {error && (
        <div role="status" className="fixed right-4 top-16 z-40 rounded-control border border-danger/60 bg-surface px-2.5 py-1 font-label text-[11px] text-danger">
          polling: {error}
        </div>
      )}

      <Link href={nav.backHref} className={`${eyebrow} inline-flex items-center gap-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring`}>
        <Icon name="arrow-left" className="size-3.5" /> {nav.backLabel}
      </Link>
      <nav aria-label="Breadcrumb" className="mt-4 flex flex-wrap items-center gap-2 text-body text-muted-foreground">
        {nav.crumbs.map((c, i) => (
          <span key={i} className="contents">
            {i > 0 && <span aria-hidden>/</span>}
            {c.href ? <Link href={c.href} className="hover:text-foreground">{c.label}</Link> : <span className="font-medium text-foreground">{c.label}</span>}
          </span>
        ))}
      </nav>

      <header className="animate-reveal mt-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={tag}>{run.packName}</span>
          <h1 className="font-heading text-display font-semibold">{run.scenarioTitle}</h1>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-label text-[11px] text-muted-foreground">{run.id}</span>
          <span className="text-muted-foreground" aria-hidden>·</span>
          <span className={tag}>Agent · {agentLabel(run.agent)}</span>
          <Badge tone={run.attack ? "danger" : "muted"}>Attack · {run.attack ? run.attack.id : "off"}</Badge>
          <Badge tone={status.tone}>{status.text}</Badge>
          {golden && <Badge tone="muted">Golden</Badge>}
        </div>
      </header>

      {isByo && running && <ConnectionStrip run={run} systems={systems} onFinished={setFinished} />}

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className={`${card} animate-reveal overflow-hidden [animation-delay:80ms]`} aria-label="Events">
          <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
            <div className="inline-flex gap-1 rounded-control border border-border p-0.5" role="tablist" aria-label="Event view">
              {toggle("flow", "Flow", "layers")}
              {toggle("list", "List", "list")}
            </div>
            <span className="ml-auto inline-flex items-center gap-2 font-label text-[11px] text-muted-foreground">
              {running && <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />}
              {eventCountLabel(run.events.length, running)}
            </span>
          </div>
          {view === "flow" ? (
            <FlowStrip events={shown} violations={run.violations} attack={run.attack} tools={tools} systems={systems} selected={selected} onOpen={setSelected} />
          ) : (
            <EventList events={shown} violations={run.violations} attack={run.attack} tools={tools} selected={selected} onOpen={setSelected} />
          )}
          {!running && run.events.length > 0 && <ReplayBar replay={replay} />}
        </section>

        <div className="animate-reveal flex flex-col gap-4 [animation-delay:160ms]">
          <ConversationPanel run={displayRun} />
          <ScorePanel run={displayRun} replaying={replay.replaying} />
          <DiffPanel run={run} principalLabel={principalLabel} />
        </div>
      </div>

      {selectedEvent && (
        <EventDrawer run={run} event={selectedEvent} events={shown} tools={tools} systems={systems} injectedLabel={injectedLabel} onClose={() => setSelected(null)} onSelect={setSelected} />
      )}
    </main>
  );
}

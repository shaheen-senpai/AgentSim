"use client";
// The Run detail view (design/agentsim-console.html lines 567-591, `openRunDetail` 1264-1282).
// Polls the Run while it is running; a BYO Run also shows how to connect and a Finish button.
// Once the Run is finished a replay bar scrubs through its Events.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { agentLabel } from "@/runner/agentRef";
import type { RunRecord, ToolDef } from "@/ui/types";
import { useReplay } from "@/ui/useReplay";
import { useRun } from "@/ui/useRun";
import { ConnectionStrip } from "./ConnectionStrip";
import { DiffPanel } from "./DiffPanel";
import { EventDrawer } from "./EventDrawer";
import { EventList } from "./EventList";
import { FlowStrip } from "./FlowStrip";
import { ReplayBar } from "./ReplayBar";
import { ScorePanel } from "./ScorePanel";

export type RunPageProps = {
  id: string;
  initialRun: RunRecord;
  tools: Record<string, ToolDef>;
  /** The pack's System keys, sorted — a stable index for `systemColor`. */
  systems: string[];
  principalLabel: string;
  injectedLabel: string;
  /** A golden Run is recorded demo data: never narrated, never written. */
  golden: boolean;
};

export function RunPage({ id, initialRun, tools, systems, principalLabel, injectedLabel, golden }: RunPageProps) {
  const { run: polled, error } = useRun(id);
  // The record `POST /finish` hands back — fresher than the last poll until the poller catches up.
  const [finished, setFinished] = useState<RunRecord | null>(null);
  // The server resolved a v1 record's pack name from its Scenario; a polled copy has not.
  const base = polled ? { ...polled, packName: polled.packName || initialRun.packName } : initialRun;
  const run = finished && base.status === "running" ? finished : base;
  const running = run.status === "running";

  const [view, setView] = useState<"flow" | "list">("flow");
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

  return (
    <section id="view-run-detail">
      {error && (
        <div role="status" style={{ position: "fixed", top: 16, right: 16, zIndex: 40, fontSize: 12, background: "var(--surface)", border: "1px solid var(--danger-fg)", color: "var(--danger-fg)", borderRadius: 8, padding: "4px 8px" }}>
          polling: {error}
        </div>
      )}
      <Link className="back-link" href="/">← All runs</Link>
      <div className="crumb">
        Runs / <b>{run.scenarioTitle}</b>
      </div>
      <div className="run-header">
        <span className="pack-pill">{run.packName}</span>
        <h1 className="page serif" style={{ fontSize: 20, margin: 0 }}>{run.scenarioTitle}</h1>
        <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{run.id}</span>
        <span style={{ marginLeft: "auto" }} className="pack-pill">Agent: {agentLabel(run.agent)}</span>
        <span className={`attack-pill${run.attack ? " on" : ""}`}>Attack: {run.attack ? "on" : "off"}</span>
      </div>

      {isByo && running && <ConnectionStrip run={run} systems={systems} onFinished={setFinished} />}

      <div className="run-detail-grid">
        <div className="panel" style={{ overflow: "hidden" }}>
          <div className="run-toolbar">
            <div className="tglgrp" role="tablist" aria-label="Event view">
              <button type="button" role="tab" aria-selected={view === "flow"} className={view === "flow" ? "active" : ""} onClick={() => setView("flow")}>Flow</button>
              <button type="button" role="tab" aria-selected={view === "list"} className={view === "list" ? "active" : ""} onClick={() => setView("list")}>List</button>
            </div>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
              {run.events.length} event{run.events.length === 1 ? "" : "s"}{running ? " · running" : ""}
            </span>
          </div>
          {view === "flow" ? (
            <FlowStrip events={shown} violations={run.violations} attack={run.attack} tools={tools} systems={systems} onOpen={setSelected} />
          ) : (
            <EventList events={shown} violations={run.violations} attack={run.attack} tools={tools} onOpen={setSelected} />
          )}
          {!running && run.events.length > 0 && <ReplayBar replay={replay} />}
        </div>
        <div>
          <div className="panel card-pad" style={{ marginBottom: 14 }}>
            <div className="heading" style={{ marginBottom: 2 }}>Trust Score</div>
            <ScorePanel run={displayRun} replaying={replay.replaying} />
          </div>
          <div className="panel" style={{ overflow: "hidden" }}>
            <div className="heading" style={{ padding: "14px 14px 0" }}>World diff · start → end</div>
            <DiffPanel run={run} principalLabel={principalLabel} />
          </div>
        </div>
      </div>

      {selectedEvent && (
        <EventDrawer run={run} event={selectedEvent} events={shown} tools={tools} systems={systems} injectedLabel={injectedLabel} onClose={() => setSelected(null)} onSelect={setSelected} />
      )}
    </section>
  );
}

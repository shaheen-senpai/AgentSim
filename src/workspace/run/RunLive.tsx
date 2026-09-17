"use client";
// The live Run: what the agent is doing, as it does it.
//
// The page is built around the one question people actually arrive with — "is anything happening?"
// — so the first thing under the header is a sentence saying whether the bridge is up, whether
// anything has connected, and, when a Run finishes empty, why that is not the same as the agent
// doing nothing (`runHint`). The score and the World diff are the answer to a later question and
// live below it, with the console's flow/diff view a click away for the deep read.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { label as dimensionLabel } from "@/engine/dimensions";
import { Icon } from "@/marketing/icons";
import { agentLabel } from "@/runner/agentRef";
import { fmtArgs, clockTime, outcomeBadge, scoreSummary, summarizeResult } from "@/ui/format";
import { idleLabel } from "@/ui/idle";
import { eventFlags } from "@/ui/run/eventFlags";
import type { Agent, Event, RunRecord, ToolDef } from "@/ui/types";
import { useOrigin } from "@/ui/useOrigin";
import { useRun } from "@/ui/useRun";
import { card, container, eyebrow, tag } from "../ui";
import { BridgeStatus, McpCommands } from "./BridgePanel";
import { runConnection, runHint } from "./bridge";
import { useBridge } from "./useBridge";

type Props = {
  runId: string;
  initialRun: RunRecord;
  /** The agent whose page this sits under — breadcrumbs and links only. */
  agent: Agent;
  /**
   * The registry entry of the agent that actually ran, which is not always the one in the URL: a
   * World can be run by more than one agent, and the bridge light has to describe the one that was
   * driven. `null` once its registration has been deleted.
   */
  runAgent: Pick<Agent, "id" | "url"> | null;
  world: { id: string; name: string };
  tools: Record<string, ToolDef>;
  /** The pack's System keys — one MCP endpoint exists per source. */
  systems: string[];
  consoleHref: string;
};

const HINT_TONE = {
  info: "border-border bg-surface text-muted-foreground",
  warn: "border-warning/50 bg-warning/10 text-warning",
  danger: "border-danger/50 bg-danger/10 text-danger",
} as const;

const STATUS_TONE = { running: "text-primary", completed: "text-safe", failed: "text-danger" } as const;

export function RunLive({ runId, initialRun, agent, runAgent, world, tools, systems, consoleHref }: Props) {
  const origin = useOrigin();
  const { run: polled, error: pollError } = useRun(runId);
  const [finished, setFinished] = useState<RunRecord | null>(null);
  const [finishing, setFinishing] = useState(false);
  const base = polled ?? initialRun;
  const run = finished && base.status === "running" ? finished : base;
  const running = run.status === "running";

  const connection = runConnection(run.agent);
  const { probe, checking, check } = useBridge(runAgent?.id ?? agent.id, connection === "bridge" && runAgent !== null);
  const hint = runHint(run, connection, probe);

  // A countdown only exists for a Run that can idle out, so it re-renders once a second only then.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || run.idleTimeoutMs === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running, run.idleTimeoutMs]);
  const idle = running ? idleLabel(run, now) : null;

  // Follow the tail while the Run is live, the way a log viewer does.
  const tail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (running) tail.current?.scrollIntoView({ block: "nearest" });
  }, [running, run.events.length]);

  async function finish() {
    setFinishing(true);
    try {
      const res = await fetch(`/api/runs/${runId}/finish`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as RunRecord & { error?: string };
      if (res.ok) setFinished(data);
    } finally {
      setFinishing(false);
    }
  }

  const mcpSources = origin ? systems.map((system) => ({ system, url: `${origin}/mcp/runs/${runId}/${system}` })) : [];

  return (
    <main id="main" className={`${container} pb-20 pt-8`}>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-body text-muted-foreground">
        <Link href="/agents" className="hover:text-foreground">Agents</Link><span aria-hidden>/</span>
        <Link href={`/agents/${agent.id}`} className="hover:text-foreground">{agent.name}</Link><span aria-hidden>/</span>
        <Link href={`/agents/${agent.id}/worlds/${world.id}`} className="hover:text-foreground">{world.name}</Link><span aria-hidden>/</span>
        <span className="font-medium text-foreground">Shift</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-display font-semibold">{run.scenarioTitle}</h1>
        <span className={`font-label text-label uppercase ${STATUS_TONE[run.status]}`}>
          {running && <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-primary align-middle" aria-hidden />}
          {run.status}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={tag}>{agentLabel(run.agent)}</span>
        <span className={tag}>{connection === "bridge" ? "Bridge" : "MCP"}</span>
        <span className={`${tag} ${run.attack ? "text-danger" : ""}`}>{run.attack ? `Attack · ${run.attack.id}` : "Clean shift"}</span>
        <span className={`${tag} font-mono`}>{run.id}</span>
        {idle && <span className={tag}>idles out in {idle}</span>}
      </div>

      <div role="status" aria-live="polite">
        {hint && (
          <div className={`mt-6 rounded-panel border px-4 py-3 ${HINT_TONE[hint.tone]}`}>
            <p className="font-heading text-body font-semibold">{hint.title}</p>
            <p className="mt-1 text-caption">{hint.body}</p>
          </div>
        )}
      </div>

      <section className={`${card} mt-5 p-5`} aria-labelledby="bridge-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="bridge-title" className={eyebrow}>{connection === "bridge" ? "The bridge" : "How to connect"}</h2>
          {running && (
            <button
              type="button"
              onClick={finish}
              disabled={finishing}
              className="cursor-pointer rounded-control border border-border px-3 py-1.5 font-label text-label-sm uppercase text-muted-foreground transition-colors duration-200 hover:border-primary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
            >
              {finishing ? "Finishing…" : "Finish & evaluate"}
            </button>
          )}
        </div>
        {connection === "bridge" ? (
          <>
            <p className="mt-3 font-mono text-caption text-foreground">{runAgent?.url || "no endpoint registered"}</p>
            {runAgent ? (
              <div className="mt-3"><BridgeStatus probe={probe} checking={checking} onCheck={check} /></div>
            ) : (
              <p className="mt-3 text-caption text-muted-foreground">This agent&rsquo;s registration has since been deleted, so there is nothing left to check.</p>
            )}
          </>
        ) : (
          <McpCommands name={agentLabel(run.agent)} sources={mcpSources} />
        )}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className={`${card} overflow-hidden`} aria-labelledby="calls-title">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <h2 id="calls-title" className={eyebrow}>Tool calls</h2>
            <span className="font-label text-caption text-muted-foreground">
              {run.events.length} call{run.events.length === 1 ? "" : "s"}{running ? " · live" : ""}
            </span>
          </div>
          <div className="max-h-[32rem] overflow-y-auto">
            {run.events.length === 0 ? (
              <p className="px-5 py-8 text-center text-caption text-muted-foreground">{running ? "Nothing yet." : "This Run recorded no tool calls."}</p>
            ) : (
              <ol>
                {run.events.map((e) => <CallRow key={e.seq} event={e} run={run} tools={tools} />)}
              </ol>
            )}
            <div ref={tail} />
          </div>
        </section>

        <div className="flex flex-col gap-5">
          <section className={`${card} p-5`} aria-labelledby="score-title">
            <h2 id="score-title" className={eyebrow}>Trust score</h2>
            <Score run={run} />
          </section>

          {run.violations.length > 0 && (
            <section className={`${card} p-5`} aria-labelledby="viol-title">
              <h2 id="viol-title" className={eyebrow}>Violations · {run.violations.length}</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {run.violations.map((v, i) => (
                  <li key={i} className="border-l-2 border-danger/60 pl-3">
                    <p className="font-label text-label-sm uppercase text-muted-foreground">{dimensionLabel(v.dimension)}{v.eventSeq !== null ? ` · call #${v.eventSeq}` : ""}</p>
                    <p className="mt-1 text-caption text-foreground">{v.message}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-caption text-muted-foreground">
            <Link href={consoleHref} className="text-primary underline-offset-4 hover:underline">Open the full flow view</Link> — parallel waves, the World diff and per-call detail.
          </p>
        </div>
      </div>

      {pollError && <p className="mt-4 text-caption text-danger">Live updates paused: {pollError}</p>}
    </main>
  );
}

function CallRow({ event, run, tools }: { event: Event; run: RunRecord; tools: Record<string, ToolDef> }) {
  const flags = eventFlags(event, run.violations, run.attack);
  return (
    <li className={`flex gap-3 border-b border-border px-5 py-3 last:border-b-0 ${flags.bad ? "bg-danger/5" : ""}`}>
      <span className="w-6 shrink-0 pt-0.5 font-mono text-caption text-muted-foreground">{event.seq}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <code className={`font-mono text-body ${flags.bad ? "text-danger" : "text-foreground"}`}>{event.tool}</code>
          {flags.injected && <span className="rounded-[4px] bg-danger/15 px-1.5 py-0.5 font-label text-label-sm uppercase text-danger">injected</span>}
          {flags.lure && <span className="rounded-[4px] bg-danger/15 px-1.5 py-0.5 font-label text-label-sm uppercase text-danger">lure taken</span>}
          {flags.error && <span className="rounded-[4px] bg-warning/15 px-1.5 py-0.5 font-label text-label-sm uppercase text-warning">refused</span>}
          <span className="ml-auto shrink-0 font-mono text-label-sm text-muted-foreground">{clockTime(event.at)}</span>
        </span>
        <span className="mt-1 block truncate font-mono text-caption text-muted-foreground" title={fmtArgs(event.input, tools[event.tool])}>
          {fmtArgs(event.input, tools[event.tool]) || "—"}
        </span>
        <span className="mt-0.5 block truncate text-caption text-muted-foreground">{summarizeResult(tools[event.tool], event)}</span>
      </span>
    </li>
  );
}

function Score({ run }: { run: RunRecord }) {
  if (run.status === "failed") return <p className="mt-2 text-caption text-danger">Run failed: {run.error}</p>;
  if (run.status === "running" || !run.score) {
    return (
      <p className="mt-2 inline-flex items-center gap-2 text-caption text-muted-foreground">
        <Icon name="spinner" className="size-3.5 animate-spin" /> Graded when the shift ends.
      </p>
    );
  }
  const score = run.score;
  const badge = outcomeBadge(score.outcome);
  return (
    <>
      <div className="mt-2 flex items-baseline gap-3">
        <span className={`font-heading text-display font-semibold tabular-nums ${score.capped ? "text-danger" : score.passed ? "text-safe" : "text-warning"}`}>{score.headline}</span>
        {score.capped && <span className="rounded-[4px] bg-danger/15 px-1.5 py-0.5 font-label text-label-sm uppercase text-danger">capped</span>}
        {badge && <span className="rounded-[4px] bg-warning/15 px-1.5 py-0.5 font-label text-label-sm uppercase text-warning">{badge}</span>}
      </div>
      <p className="mt-2 text-caption text-muted-foreground">{run.narrative ?? scoreSummary(score)}</p>
      <ul className="mt-4 flex flex-col gap-2.5">
        {score.dimensions.map((d) => (
          <li key={d.name}>
            <span className="flex items-baseline justify-between gap-2 text-caption">
              <span className="text-muted-foreground">{dimensionLabel(d.name)}</span>
              <span className={`font-mono tabular-nums ${d.score < 100 ? "text-danger" : "text-muted-foreground"}`}>{d.score}</span>
            </span>
            <span className="mt-1 block h-1 rounded-full bg-border">
              <span className={`block h-1 rounded-full ${d.score < 100 ? "bg-danger" : "bg-safe"}`} style={{ width: `${d.score}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

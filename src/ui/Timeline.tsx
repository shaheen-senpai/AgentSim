"use client";
import { useMemo } from "react";
import type { RunRecord } from "./types";
import { EventRow } from "./EventRow";
import { ViolationCard } from "./ViolationCard";
import { elapsedLabel } from "./format";
import { heading } from "./styles";

export function Timeline({ run, visible }: { run: RunRecord; visible: number }) {
  const events = run.events.slice(0, visible);
  const bySeq = useMemo(() => {
    const m = new Map<number, RunRecord["violations"]>();
    for (const v of run.violations) if (v.eventSeq !== null) m.set(v.eventSeq, [...(m.get(v.eventSeq) ?? []), v]);
    return m;
  }, [run.violations]);
  const outcome = run.violations.filter((v) => v.eventSeq === null);
  const injectionSeq = run.events.find((e) => e.injected)?.seq; // the gateway stamps the Event that surfaced the Attack's text
  const complete = run.status !== "running" && visible >= run.events.length;
  const jump = (seq: number) => document.getElementById(`event-${run.id}-${seq}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <>
      <div className="flex justify-between items-center px-3 py-2.5">
        <div className={heading}>Timeline · {run.events.length} events{run.durationMs ? ` · ${(run.durationMs / 1000).toFixed(1)}s` : ""}{run.usage.inputTokens ? ` · ${Math.round(run.usage.inputTokens / 1000)}k tokens` : ""}</div>
        <span className="text-xs text-[#6b6b66]">{run.violations.length} violation{run.violations.length === 1 ? "" : "s"}{visible < run.events.length ? ` · showing #1–#${visible}` : ""}</span>
      </div>
      <div className="flex-1 overflow-auto">
        {events.map((ev, i) => (
          <div key={ev.seq}>
            <EventRow ev={ev} run={run} elapsed={elapsedLabel(run.events, i)} bad={bySeq.has(ev.seq)} id={`event-${run.id}-${ev.seq}`} />
            <ViolationCard violations={bySeq.get(ev.seq) ?? []} sourceSeq={bySeq.has(ev.seq) ? injectionSeq : undefined} onJump={jump} />
          </div>
        ))}
        {complete && outcome.length > 0 && (
          <div>
            <div className="grid grid-cols-[32px_1fr_auto] gap-3 px-3 py-2 border-t border-[#e6e6e2] bg-[#fbeeea] border-l-[3px] border-l-[#c8321e]">
              <div className="text-xs text-[#6b6b66] flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-[#c8321e]" />end</div>
              <div className="text-[13px] font-semibold">End of Run · final World</div><div />
            </div>
            <ViolationCard violations={outcome} />
          </div>
        )}
        {run.status === "running" && <div className="px-3 py-3 text-xs text-[#6b6b66]">Agent is working…</div>}
      </div>
    </>
  );
}

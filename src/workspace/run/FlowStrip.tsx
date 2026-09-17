"use client";
// The horizontal flow of a Run's Events: one node per tool call, an edge between waves, and a wave
// of concurrent calls stacked in a column. Grouping comes from `@/ui/waves`; flags from eventFlags.
import { Fragment } from "react";
import type { Attack } from "@/engine/pack";
import { fmtArgs } from "@/ui/format";
import { eventFlags } from "@/ui/run/eventFlags";
import { systemColor } from "@/ui/systemColor";
import type { Event, ToolDef, Violation } from "@/ui/types";
import { groupWaves } from "@/ui/waves";
import { Flag } from "./bits";

export type FlowStripProps = {
  events: Event[];
  violations: Violation[];
  attack: Attack | null;
  tools: Record<string, ToolDef>;
  systems: string[];
  selected: number | null;
  onOpen: (seq: number) => void;
};

export function FlowStrip({ events, violations, attack, tools, systems, selected, onOpen }: FlowStripProps) {
  const bySeq = new Map(events.map((e) => [e.seq, e]));
  const waves = groupWaves(events);

  const node = (e: Event) => {
    const f = eventFlags(e, violations, attack);
    const tool = tools[e.tool];
    const colour = systemColor(systems, tool?.system ?? "");
    const active = e.seq === selected;
    return (
      <button
        key={e.seq}
        type="button"
        onClick={() => onOpen(e.seq)}
        aria-label={`Event #${e.seq} ${e.tool}`}
        aria-pressed={active}
        className={`animate-pop-in relative z-[1] w-44 shrink-0 cursor-pointer rounded-panel border px-3 py-2.5 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
          f.bad ? "border-danger/60 bg-danger/10 hover:border-danger" : "border-border bg-background hover:border-primary/60"
        } ${active ? (f.bad ? "border-danger" : "border-primary") : ""}`}
      >
        <span className="font-label text-label-sm text-muted-foreground">#{e.seq}</span>
        <span className={`mt-0.5 flex items-center gap-1.5 truncate font-label text-caption font-bold ${f.bad ? "text-danger" : "text-foreground"}`}>
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: colour.fg }} aria-hidden />
          <span className="truncate">{e.tool}</span>
        </span>
        <span className="mt-0.5 block truncate font-label text-[10px] leading-[1.4] text-muted-foreground">{fmtArgs(e.input, tool) || "no arguments"}</span>
        {(f.injected || f.violation || f.error) && (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {f.injected && <Flag tone="danger">injected</Flag>}
            {f.violation && <Flag tone="danger">violation</Flag>}
            {f.error && <Flag tone="muted">error</Flag>}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="relative overflow-hidden">
      <div className="flex items-center overflow-x-auto px-5 py-9">
        {events.length === 0 && <p className="text-caption text-muted-foreground">No events yet.</p>}
        {waves.map((w, i) => {
          const evs = w.seqs.map((seq) => bySeq.get(seq)!);
          return (
            <Fragment key={w.seqs[0]}>
              {i > 0 && <div className="h-px w-7 shrink-0 bg-border" aria-hidden />}
              {evs.length > 1 ? <div className="flex shrink-0 flex-col gap-1.5">{evs.map(node)}</div> : node(evs[0])}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

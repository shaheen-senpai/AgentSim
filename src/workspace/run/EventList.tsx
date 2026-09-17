"use client";
// The List view of a Run's Events: one ledger row each, the same flags as the Flow nodes.
import type { Attack } from "@/engine/pack";
import { fmtArgs } from "@/ui/format";
import { eventFlags } from "@/ui/run/eventFlags";
import type { Event, ToolDef, Violation } from "@/ui/types";
import { Flag } from "./bits";

export type EventListProps = {
  events: Event[];
  violations: Violation[];
  attack: Attack | null;
  tools: Record<string, ToolDef>;
  selected: number | null;
  onOpen: (seq: number) => void;
};

export function EventList({ events, violations, attack, tools, selected, onOpen }: EventListProps) {
  return (
    <div className="flex flex-col gap-1 p-3.5">
      {events.length === 0 && <p className="text-caption text-muted-foreground">No events yet.</p>}
      {events.map((e, i) => {
        const f = eventFlags(e, violations, attack);
        const active = e.seq === selected;
        return (
          <button
            key={e.seq}
            type="button"
            onClick={() => onOpen(e.seq)}
            aria-pressed={active}
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            className={`animate-line-in flex w-full cursor-pointer items-baseline gap-2.5 rounded-control border px-2.5 py-1.5 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ring ${
              f.bad ? "border-danger/40 bg-danger/10 hover:border-danger/70" : "border-transparent hover:bg-background"
            } ${active ? (f.bad ? "border-danger" : "border-primary/60 bg-background") : ""}`}
          >
            <span className="w-6 shrink-0 font-label text-label-sm text-muted-foreground">#{e.seq}</span>
            <span className={`font-label text-caption font-semibold ${f.bad ? "text-danger" : "text-foreground"}`}>{e.tool}</span>
            <span className="min-w-0 flex-1 truncate font-label text-[11px] text-muted-foreground">{fmtArgs(e.input, tools[e.tool])}</span>
            {f.injected && <Flag tone="danger">injected</Flag>}
            {f.error && <Flag tone="muted">error</Flag>}
          </button>
        );
      })}
    </div>
  );
}

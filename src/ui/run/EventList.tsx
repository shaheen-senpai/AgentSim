"use client";
// The List view of a Run's Events (design/agentsim-console.html 1303-1305): one ledger row each.
import type { Attack } from "@/engine/pack";
import type { Event, ToolDef, Violation } from "@/ui/types";
import { fmtArgs } from "@/ui/format";
import { eventFlags } from "./eventFlags";

export type EventListProps = {
  events: Event[];
  violations: Violation[];
  attack: Attack | null;
  tools: Record<string, ToolDef>;
  onOpen: (seq: number) => void;
};

export function EventList({ events, violations, attack, tools, onOpen }: EventListProps) {
  return (
    <div className="list-strip" style={{ padding: 14 }}>
      {events.length === 0 && <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>No events yet.</p>}
      {events.map((e) => {
        const f = eventFlags(e, violations, attack);
        return (
          <button key={e.seq} type="button" className={`ledger-row${f.bad ? " bad" : ""}`} onClick={() => onOpen(e.seq)}>
            <span className="step">#{e.seq}</span>
            <span className="call">{e.tool}</span>
            <span className="args">{fmtArgs(e.input, tools[e.tool])}</span>
            {f.injected && <span className="flow-flag" style={{ background: "var(--danger-bg)", color: "var(--danger-fg)", marginLeft: "auto" }}>injected</span>}
            {f.error && <span className="flow-flag" style={{ background: "var(--border)", color: "var(--muted)", marginLeft: f.injected ? 4 : "auto" }}>error</span>}
          </button>
        );
      })}
    </div>
  );
}

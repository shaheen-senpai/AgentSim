"use client";
// The mock's horizontal flow strip (design/agentsim-console.html 1290-1321): one node per Event,
// an edge between waves, and a wave of concurrent calls stacked in a `.flow-batch`.
import { Fragment } from "react";
import type { Attack } from "@/engine/pack";
import type { Event, ToolDef, Violation } from "@/ui/types";
import { fmtArgs } from "@/ui/format";
import { systemColor } from "@/ui/systemColor";
import { groupWaves } from "@/ui/waves";
import { eventFlags } from "./eventFlags";

export type FlowStripProps = {
  events: Event[];
  violations: Violation[];
  attack: Attack | null;
  tools: Record<string, ToolDef>;
  systems: string[];
  onOpen: (seq: number) => void;
};

const DANGER = { background: "var(--danger-bg)", color: "var(--danger-fg)" } as const;
const NEUTRAL = { background: "var(--border)", color: "var(--muted)" } as const;

export function FlowStrip({ events, violations, attack, tools, systems, onOpen }: FlowStripProps) {
  const bySeq = new Map(events.map((e) => [e.seq, e]));
  const waves = groupWaves(events);

  const node = (e: Event) => {
    const f = eventFlags(e, violations, attack);
    const tool = tools[e.tool];
    const colour = systemColor(systems, tool?.system ?? "");
    return (
      <button key={e.seq} type="button" className={`flow-node${f.bad ? " bad" : ""}`} onClick={() => onOpen(e.seq)} aria-label={`Event #${e.seq} ${e.tool}`}>
        <span className="seq">#{e.seq}</span>
        <div className="tool">
          <span className="sys-dot" style={{ background: colour.fg }} />
          {e.tool}
        </div>
        <div className="argline">{fmtArgs(e.input, tool)}</div>
        {(f.injected || f.violation || f.error) && (
          <div className="flags">
            {f.injected && <span className="flow-flag" style={DANGER}>injected</span>}
            {f.violation && <span className="flow-flag" style={DANGER}>violation</span>}
            {f.error && <span className="flow-flag" style={NEUTRAL}>error</span>}
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="canvas-wrap">
      <div className="flow-strip">
        {events.length === 0 && <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>No events yet.</p>}
        {waves.map((w, i) => {
          const evs = w.seqs.map((seq) => bySeq.get(seq)!);
          return (
            <Fragment key={w.seqs[0]}>
              {i > 0 && <div className="flow-edge" />}
              {evs.length > 1 ? <div className="flow-batch">{evs.map(node)}</div> : node(evs[0])}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

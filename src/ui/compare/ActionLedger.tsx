"use client";
// The git-diff-style ledger (design/agentsim-console.html `stepHtml` 1125-1136, ledger 1175-1195):
// both Runs' identical opening steps once, a fork marker, then each Run's remaining steps side by
// side. A step expands in place to show its input, its result and why it is flagged.
// `commonPrefixLength` is the only logic; everything a step shows is already on the Event.
import { useState } from "react";
import type { Attack } from "@/engine/pack";
import { agentLabel } from "@/runner/agentRef";
import type { Event, RunRecord, Violation } from "@/ui/types";
import { fmtArgs, prettyJson, runName } from "@/ui/format";
import { eventFlags } from "@/ui/run/eventFlags";
import { commonPrefixLength } from "./compareLedger";

const argSummary = (e: Event): string => fmtArgs(e.input) || "—";

/**
 * `event` drives the flags (injected/lure/violation/error/result); for a shared step that is not
 * always Run A's copy — two Runs can share a step's tool+input while one copy carries the Attack's
 * planted text. `labelEvent` (defaults to `event`) drives only the header line.
 */
function Step({ event, labelEvent = event, seq, attack, violations }: { event: Event; labelEvent?: Event; seq: number; attack: Attack | null; violations: Violation[] }) {
  const [open, setOpen] = useState(false);
  const f = eventFlags(event, violations, attack);
  const toggle = () => setOpen((o) => !o);
  const tag = f.lure ? (
    <span className="tag-xs bad" style={{ marginLeft: "auto" }}>Lure taken</span>
  ) : f.injected ? (
    <span className="tag-xs bad" style={{ marginLeft: "auto" }}>attack text read here</span>
  ) : f.error ? (
    <span className="tag-xs" style={{ marginLeft: "auto" }}>error</span>
  ) : null;
  return (
    <div
      className={`cmp-step${f.bad ? " bad" : ""}${f.injected ? " inj" : ""}${open ? " open" : ""}`}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <div className="top">
        <span className="step">#{seq}</span>
        <span className="call">{labelEvent.tool}</span>
        <span className="args">{argSummary(labelEvent)}</span>
        {tag}
      </div>
      <div className="res">
        <b>input</b> · {argSummary(event)}
        <br />
        <b>result</b>
        <pre style={{ margin: "4px 0 2px", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflow: "auto", fontSize: 11, fontFamily: "var(--mono)" }}>
          {event.error ?? (event.result ? prettyJson(event.result) : "ok")}
        </pre>
        {event.injected && (
          <>
            <b>attack surface</b> · planted text arrived in this result, from {event.injected.collection}/{event.injected.id}.{event.injected.field}
            <br />
          </>
        )}
        {f.lure && (
          <>
            <b>why it is flagged</b> · this is the Lure the Attack was aiming for — the tool permitted the call, a graded Check caught it afterwards
          </>
        )}
      </div>
    </div>
  );
}

function ColumnLabel({ run }: { run: RunRecord }) {
  return (
    <div className="ledger-col-label" style={{ color: run.score?.capped ? "var(--danger-fg)" : "var(--success-fg)" }}>
      ● {runName(agentLabel(run.agent), run.attack?.id ?? null)} · {run.id.slice(0, 12)}
    </div>
  );
}

export function ActionLedger({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const a = runA.events, b = runB.events;
  const shared = commonPrefixLength(a, b);
  const attack = runA.attack ?? runB.attack;
  const ends = <div style={{ fontSize: 12, color: "var(--muted)", padding: "6px 10px" }}>— ends here</div>;

  return (
    <section className="panel card-pad" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Action ledger</h2>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Click any step for its input, its result, and why it is flagged.</span>
      </div>

      {shared > 0 && (
        <>
          <div className="ledger-col-label" style={{ color: "var(--muted)" }}>◦ identical — both runs took these {shared} steps, in this order</div>
          {a.slice(0, shared).map((eA, i) => {
            // Shared means tool+input agree; results can differ — flag from whichever copy carries the planted text.
            const eB = b[i];
            const flagged = eA.injected ? eA : eB;
            return <Step key={i} event={flagged} labelEvent={eA} seq={i + 1} attack={attack} violations={flagged === eA ? runA.violations : runB.violations} />;
          })}
        </>
      )}

      {shared >= a.length && shared >= b.length ? (
        <>
          <div className="ledger-fork">no divergence</div>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
            These two runs took byte-identical ledgers. Any score difference between them would come from the World they ran against, not from what they did.
          </p>
        </>
      ) : (
        <>
          <div className="ledger-fork">diverges at #{shared + 1}</div>
          <div className="ledger-split">
            <div>
              <ColumnLabel run={runA} />
              {a.slice(shared).length === 0 ? ends : a.slice(shared).map((e, i) => <Step key={e.seq} event={e} seq={shared + i + 1} attack={runA.attack} violations={runA.violations} />)}
            </div>
            <div>
              <ColumnLabel run={runB} />
              {b.slice(shared).length === 0 ? ends : b.slice(shared).map((e, i) => <Step key={e.seq} event={e} seq={shared + i + 1} attack={runB.attack} violations={runB.violations} />)}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

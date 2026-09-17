// src/ui/compare/ActionLedger.tsx
"use client";
// The git-diff-style ledger: both Runs' identical opening steps shown once, then a fork marker,
// then each Run's remaining steps side by side. Every step expands in place (not a side drawer —
// two Runs' drawers would compete for the same space) to show its input, result/error, and why it's
// flagged. `commonPrefixLength` (Task 1) is the only new logic; everything a step shows is already
// on the Event itself.
import { useState } from "react";
import { matchesLure } from "@/engine/lure";
// `Attack` is not re-exported by `@/ui/types` (only `WizardAttack`, a distinct wizard-draft shape,
// lives there) — every other `src/ui` consumer of the real `Attack` type (`packView.ts`,
// `buildFlow.ts`, `AttackPanel.tsx`) imports it straight from its engine source, type-only, so this
// follows the same established convention rather than adding a new re-export surface.
import type { Attack } from "@/engine/pack";
import type { Event, RunRecord } from "@/ui/types";
import { prettyJson } from "@/ui/format";
import { agentLabel } from "@/runner/agentRef";
import { dangerBg, dangerFg, heading, mono, panel, successFg } from "@/ui/styles";
import { commonPrefixLength } from "./compareLedger";

function argSummary(e: Event): string {
  const entries = Object.entries(e.input);
  return entries.length === 0 ? "—" : entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
}

/** A `<pre>` that wraps rather than widening the page — long results scroll, never push. Same
    treatment as `EventDrawer.tsx`'s `Json` (Finding 3): real tool results here can carry hundreds
    of unbroken characters with no whitespace, which force the page wider with no wrap point. */
function Json({ text }: { text: string }) {
  return <pre className={`${mono} max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded border border-[#E3E0D5] bg-[#F7F5EF] p-2 text-[11px] leading-4`}>{text}</pre>;
}

/**
 * `event` drives everything a step can be flagged for (injected/lure/error/result) — for a shared
 * step this is *not* always `eventsA[i]` (see the caller in `ActionLedger`): two Runs can share a
 * step's tool+input while their results genuinely differ, e.g. one Run's copy carries the Attack's
 * planted text and the other's doesn't (Finding 1). `labelEvent` (defaults to `event`) drives only
 * the header's tool name + argument summary — tool+input are identical by definition for a shared
 * step, so the caller pins this to Run A's copy for a deterministic display line regardless of
 * which Run's copy was picked to flag from.
 */
function StepRow({ event, labelEvent = event, seq, attack }: { event: Event; labelEvent?: Event; seq: number; attack: Attack | null }) {
  const [open, setOpen] = useState(false);
  const injected = event.injected !== null;
  const lure = attack ? matchesLure(attack.lure, event) : false;
  const tone = lure ? { background: dangerBg } : event.error ? undefined : injected ? { background: "#FDF3DF" } : undefined;

  return (
    <div className="rounded" style={tone}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-baseline gap-2.5 px-2.5 py-1.5 text-left text-[12px]"
      >
        <span className={`${mono} text-[#6E6B60] w-6 text-right shrink-0`}>#{seq}</span>
        {/* `truncate` (not just `font-semibold`) so this can shrink and ellipsis instead of forcing
            the row — and on a very narrow column, the whole page — wider than its container: a
            single unbroken tool name has no natural wrap point, and without a non-`visible` overflow
            a flex item's automatic minimum width is its full content width, not 0. */}
        <span className={`${mono} font-semibold truncate shrink min-w-0`} style={lure ? { color: dangerFg } : undefined}>
          {labelEvent.tool}
        </span>
        <span className={`${mono} text-[11px] text-[#6E6B60] truncate flex-1`}>{argSummary(labelEvent)}</span>
        {lure && <span className="text-[9px] font-bold uppercase tracking-wide shrink-0" style={{ color: dangerFg }}>Lure taken</span>}
        {!lure && injected && <span className="text-[9px] font-bold uppercase tracking-wide shrink-0 text-[#6E6B60]">attack text read</span>}
        {event.error && <span className="text-[9px] font-bold uppercase tracking-wide shrink-0 text-[#6E6B60]">error</span>}
      </button>
      {open && (
        <div className="ml-8 mr-2.5 mb-2 pl-2.5 border-l-2 border-[#E3E0D5] text-[11.5px] text-[#6E6B60] leading-relaxed flex flex-col gap-1.5">
          <div>
            <b className="text-[#1B1A17] block mb-0.5">input</b>
            <Json text={JSON.stringify(event.input, null, 2)} />
          </div>
          <div>
            <b className="text-[#1B1A17] block mb-0.5">result</b>
            <Json text={prettyJson(event.error ?? event.result ?? "ok")} />
          </div>
          {injected && event.injected && (
            <div>
              <b className="text-[#1B1A17]">attack surface</b> · planted text arrived in this result, from {event.injected.collection}/{event.injected.id}.{event.injected.field}
            </div>
          )}
          {lure && (
            <div>
              <b className="text-[#1B1A17]">why it is flagged</b> · this is the Lure the Attack was aiming for — the tool permitted the call, a graded Check caught it afterwards
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ActionLedger({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const eventsA = runA.events, eventsB = runB.events;
  const shared = commonPrefixLength(eventsA, eventsB);
  const attackA = runA.attack, attackB = runB.attack;

  return (
    <section className={`${panel} p-4 flex flex-col gap-3`}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className={`${heading} text-[13px] normal-case tracking-normal font-semibold`}>Action ledger</h2>
        <span className="text-[11.5px] text-[#6E6B60]">Click any step for its input, its result, and why it is flagged.</span>
      </div>

      {shared > 0 && (
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] uppercase tracking-wide text-[#6E6B60] font-semibold px-2.5">
            ◦ same calls, in the same order — both Runs took these {shared} steps
          </div>
          {eventsA.slice(0, shared).map((eA, i) => {
            // Shared means eA/eB agree on tool+input by definition — but their *results* can
            // genuinely differ (e.g. one Run's copy carries the Attack's planted text and the
            // other's doesn't). Flag from whichever copy actually has `injected` set, matching
            // whichever Run's Attack actually surfaced there (Finding 1); fall back to eB when
            // neither does, and to whichever Run actually has an Attack for lure-matching.
            const eB = eventsB[i];
            const flagged = eA.injected ? eA : eB;
            return <StepRow key={i} event={flagged} labelEvent={eA} seq={i + 1} attack={attackA ?? attackB} />;
          })}
        </div>
      )}

      {shared >= eventsA.length && shared >= eventsB.length ? (
        <div className="text-[12.5px] text-[#6E6B60] px-2.5">
          These two Runs took byte-identical ledgers. Any score difference between them comes from the World they ran against, not from what they did.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5 text-[11px] uppercase tracking-wide font-semibold text-[#6E6B60]">
            <span className="flex-1 h-px bg-[#E3E0D5]" />
            diverges at #{shared + 1}
            <span className="flex-1 h-px bg-[#E3E0D5]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-0.5">
              <div className="text-[10px] uppercase tracking-wide font-bold px-2.5" style={{ color: runA.score?.capped ? dangerFg : successFg }}>
                ● A — {agentLabel(runA.agent)} · {runA.id.slice(0, 12)}
              </div>
              {eventsA.slice(shared).length === 0 ? (
                <div className="text-[12px] text-[#6E6B60] px-2.5">— ends here</div>
              ) : (
                eventsA.slice(shared).map((e, i) => <StepRow key={i} event={e} seq={shared + i + 1} attack={attackA} />)
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="text-[10px] uppercase tracking-wide font-bold px-2.5" style={{ color: runB.score?.capped ? dangerFg : successFg }}>
                ● B — {agentLabel(runB.agent)} · {runB.id.slice(0, 12)}
              </div>
              {eventsB.slice(shared).length === 0 ? (
                <div className="text-[12px] text-[#6E6B60] px-2.5">— ends here</div>
              ) : (
                eventsB.slice(shared).map((e, i) => <StepRow key={i} event={e} seq={shared + i + 1} attack={attackB} />)
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { label as dimensionLabel } from "@/engine/dimensions";
import type { Event, RunRecord, ToolDef, Violation } from "../types";
import type { FlowSelection } from "./useFlowState";
import { injectedText, locateInjection } from "./injected";
import { ViolationCard } from "../ViolationCard";
import { clockTime, prettyJson } from "../format";
import { systemColor } from "../systemColor";
import { dangerPill, heading, mono } from "../styles";

export type EventDrawerProps = {
  run: RunRecord;
  /** The Events currently on the graph (the Replay prefix) — also what `←`/`→` walk. */
  events: Event[];
  selected: FlowSelection;
  onSelect: (selection: FlowSelection) => void;
  /** Select `seq` *and* bring it into view — `FlowView` owns the camera. */
  onJump: (seq: number) => void;
  tools: Record<string, ToolDef>;
  /** The pack's Systems, for a stable `systemColor` index. */
  systems: string[];
  /** False while replaying: the Trust Score is withheld until the whole Run is on screen. */
  scoreReady: boolean;
  /** The Run's pack's label for the collection its Attack injected into — see `ViolationCard`. */
  injectedLabel: string;
};

/** The drawer's width. `useFlowCamera` aims the camera past it, so the two must not drift apart. */
export const DRAWER_W = 380;

type Tab = "details" | "violations" | "injected";
const TAB_LABEL: Record<Tab, string> = { details: "Details", violations: "Violations", injected: "Injected" };

const MUTED = "text-[#6E6B60]";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[#E3E0D5] px-3 py-2.5 first:border-t-0">
      <h3 className={heading}>{title}</h3>
      <div className="mt-1.5 text-[12px]">{children}</div>
    </section>
  );
}

/** A pre block that wraps rather than widening the drawer — long results scroll, never push. */
function Json({ text }: { text: string }) {
  return <pre className={`${mono} max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded border border-[#E3E0D5] bg-[#F7F5EF] p-2 text-[11px] leading-4`}>{text}</pre>;
}

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-px">
      <span className={`w-20 shrink-0 ${MUTED}`}>{name}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className={`px-3 py-4 text-[12px] ${MUTED}`}>{children}</p>;
}

/** The *Details* tab: the call, what came back, what it changed, and when. */
function Details({ ev }: { ev: Event }) {
  return (
    <>
      <Section title="Input">
        <Json text={JSON.stringify(ev.input, null, 2)} />
      </Section>
      {ev.error && (
        <Section title="Error">
          <p className="text-[#B23A22]">{ev.error}</p>
        </Section>
      )}
      {ev.result && (
        <Section title="Result">
          <Json text={prettyJson(ev.result)} />
        </Section>
      )}
      <Section title={`Changes · ${ev.changes.length}`}>
        {ev.changes.length === 0 ? (
          <p className={MUTED}>No World changes.</p>
        ) : (
          <ul className={`${mono} text-[11px]`}>
            {ev.changes.map((c, i) => (
              <li key={i} className="py-px">
                <span className="font-semibold uppercase">{c.op}</span> {c.collection} <span className={MUTED}>{c.id}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Timing">
        <Field name="started">
          <span className={mono}>{clockTime(ev.startedAt)}</span>
        </Field>
        <Field name="ended">
          <span className={mono}>{clockTime(ev.endedAt)}</span>
        </Field>
        <Field name="duration">
          <span className={mono}>{ev.endedAt - ev.startedAt} ms</span>
        </Field>
        <Field name="source">
          <span className={mono}>{ev.source}</span>
        </Field>
        <Field name="batch">
          <span className={mono}>{ev.batchId ?? "—"}</span>
        </Field>
      </Section>
    </>
  );
}

/** The *Injected* tab: where the Attack wrote, and the poison inside the value the agent read. */
function Injected({ run, ev }: { run: RunRecord; ev: Event }) {
  const target = ev.injected;
  const text = run.attack ? injectedText(run.attack) : "";
  const context = useMemo(() => (target ? locateInjection(ev.result, target, text) : null), [ev.result, target, text]);
  if (!target) return null;

  return (
    <>
      <Section title={`Injected by Attack · ${target.attackId}`}>
        <Field name="collection">
          <span className={mono}>{target.collection}</span>
        </Field>
        <Field name="row">
          <span className={mono}>{target.id}</span>
        </Field>
        <Field name="field">
          <span className={mono}>{target.field}</span>
        </Field>
      </Section>
      <Section title={context ? `In context · ${context.key}` : "Injected text"}>
        {!context && (
          <p className={`mb-1.5 ${MUTED}`}>
            {text
              ? "The surrounding field value could not be located in this Event's result — showing the injected text on its own."
              : "This Run no longer carries the Attack that wrote here, so the injected text cannot be shown."}
          </p>
        )}
        <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded border border-[#E3E0D5] bg-white p-2 text-[11px] leading-4">
          {context ? (
            <>
              {context.before}
              <mark className="bg-[#FBEAE7] font-semibold text-[#B23A22]">{context.match}</mark>
              {context.after}
            </>
          ) : (
            text
          )}
        </pre>
      </Section>
    </>
  );
}

/** The `end` node's view: the Trust Score (once the whole Run is shown) and the outcome Violations. */
function EndOfRun({ run, outcome, scoreReady }: { run: RunRecord; outcome: Violation[]; scoreReady: boolean }) {
  const score = run.score;
  return (
    <>
      <Section title="Trust Score">
        {run.status === "failed" ? (
          <p className="text-[#B23A22]">Run failed: {run.error}</p>
        ) : !scoreReady || !score ? (
          <p className={MUTED}>evaluating…</p>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className={`${mono} text-[40px] font-bold leading-none tracking-tight ${score.capped ? "text-[#B23A22]" : ""}`}>{score.headline}</span>
              {score.capped && <span className={`${dangerPill} px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[.08em]`}>Capped</span>}
            </div>
            {score.capReason && <p className={`mt-1.5 ${MUTED}`}>{score.capReason}</p>}
            <div className="mt-2 flex flex-col gap-1">
              {score.dimensions.map((d) => (
                <div key={d.name} className="flex justify-between gap-2">
                  <span>{dimensionLabel(d.name)}</span>
                  <span className={`${mono} ${d.score < 100 ? "font-bold text-[#B23A22]" : ""}`}>
                    {d.score} <span className={`${MUTED} font-normal`}>{d.total === 0 ? "(no checks)" : `(${d.passed}/${d.total} fully)`}</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>
      <Section title={`Outcome Violations · ${outcome.length}`}>
        {outcome.length === 0 ? <p className={MUTED}>None — the final World is as the Scenario expects.</p> : <ViolationCard violations={outcome} className="" />}
      </Section>
    </>
  );
}

/**
 * The drawer of spec §6.1: an overlay on the right of the flow panel showing whatever the flow has
 * selected. `Escape` closes it; `←`/`→` walk the visible Events. It lives inside `FlowView`'s
 * `ReactFlowProvider` so the Violations tab's "jump to #N" can move the camera as well as the
 * selection.
 */
export function EventDrawer({ run, events, selected, onSelect, onJump, tools, systems, scoreReady, injectedLabel }: EventDrawerProps) {
  const open = selected !== null;
  const ev = typeof selected === "number" ? events.find((e) => e.seq === selected) ?? null : null;

  const { mine, outcome } = useMemo(() => {
    const seq = ev?.seq;
    return {
      mine: seq === undefined ? [] : run.violations.filter((v) => v.eventSeq === seq),
      outcome: run.violations.filter((v) => v.eventSeq === null),
    };
  }, [run.violations, ev?.seq]);

  // Spec §6.1: the Violations tab offers a jump to where the injected content was actually read.
  const injectionSeq = useMemo(() => events.find((e) => e.injected !== null)?.seq, [events]);
  const sourceSeq = run.attack && mine.length > 0 && injectionSeq !== undefined && injectionSeq !== ev?.seq ? injectionSeq : undefined;

  const tabs = useMemo<Tab[]>(() => (ev?.injected ? ["details", "violations", "injected"] : ["details", "violations"]), [ev?.injected]);
  // Derived, not synced: a tab the current selection does not offer simply falls back to Details.
  const [wanted, setTab] = useState<Tab>("details");
  const tab = tabs.includes(wanted) ? wanted : "details";

  const close = useCallback(() => onSelect(null), [onSelect]);

  // `←`/`→` move the selection along the visible Events; `start`/`end` are the ends of that walk.
  const step = useCallback(
    (dir: 1 | -1) => {
      if (events.length === 0) return;
      if (selected === "start") {
        if (dir === 1) onJump(events[0].seq);
        return;
      }
      if (selected === "end") {
        if (dir === -1) onJump(events[events.length - 1].seq);
        return;
      }
      if (typeof selected !== "number") return;
      // Nearest visible neighbour in the pressed direction, rather than an index step: for a live
      // selection that *is* the next/previous Event, and for a stale one (the Replay scrubbed back
      // past it) it steps to the nearest Event still on screen instead of to the list's end.
      let next: Event | undefined;
      for (const e of events) {
        if (dir === 1 ? e.seq > selected : e.seq < selected) {
          next = e;
          if (dir === 1) break; // ascending: the first match is the nearest above
        }
      }
      if (next) onJump(next.seq);
    },
    [events, selected, onJump],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // The tablist claims `←`/`→` for itself while focused (it calls `preventDefault`), and a
      // typed arrow inside a field is never navigation.
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        step(e.key === "ArrowRight" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, step]);

  // Focus moves into the drawer when it opens and back where it came from when it closes — but not
  // on every selection change, or `←`/`→` would yank focus out of the drawer on each press.
  const panelRef = useRef<HTMLElement>(null);
  const returnTo = useRef<Element | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      returnTo.current = document.activeElement;
      panelRef.current?.focus();
    } else if (!open && wasOpen.current) {
      const previous = returnTo.current;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      returnTo.current = null;
    }
    wasOpen.current = open;
  }, [open]);

  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tabs[(tabs.indexOf(tab) + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  if (!open) return null;

  const system = ev ? tools[ev.tool]?.system : undefined;
  const color = system ? systemColor(systems, system) : null;
  // A number with no Event behind it means the Replay has been wound back past what was selected —
  // say so rather than falling through to one of the meta views.
  const rewound = ev === null && typeof selected === "number";
  const title = ev ? `#${ev.seq} · ${ev.tool}` : rewound ? `#${selected}` : selected === "start" ? "Run started" : "End of Run";

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="complementary"
      aria-label={`Details for ${title}`}
      style={{ width: DRAWER_W }}
      className="absolute right-0 top-0 bottom-0 z-10 flex max-w-full flex-col overflow-hidden border-l border-[#E3E0D5] bg-white shadow-[-4px_0_16px_rgba(27,26,23,.06)] outline-none"
    >
      <header className="flex items-start gap-2 border-b border-[#E3E0D5] px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className={`${mono} truncate text-[13px] font-semibold`}>{title}</div>
          <div className={`mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] ${MUTED}`}>
            {system && color && (
              <span className="rounded-sm px-1 py-px text-[9px] font-semibold uppercase tracking-[.04em]" style={{ background: color.bg, color: color.fg }}>
                {system}
              </span>
            )}
            {ev && <span className={mono}>{ev.endedAt - ev.startedAt} ms</span>}
            {!ev && <span>{rewound ? "not yet shown" : selected === "start" ? run.scenarioTitle : `${run.events.length} Events`}</span>}
          </div>
        </div>
        <button type="button" onClick={close} aria-label="Close details" className="-mr-1 h-6 w-6 shrink-0 rounded border border-[#E3E0D5] text-[13px] leading-none text-[#6E6B60] hover:text-[#1B1A17]">
          ×
        </button>
      </header>

      {ev && (
        <div role="tablist" aria-label="Event details" onKeyDown={onTabKeyDown} className="flex gap-1 border-b border-[#E3E0D5] px-3 py-1.5">
          {tabs.map((t) => (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[t] = el;
              }}
              type="button"
              role="tab"
              id={`drawer-tab-${t}`}
              aria-selected={t === tab}
              aria-controls="drawer-panel"
              tabIndex={t === tab ? 0 : -1}
              onClick={() => setTab(t)}
              className={`h-6 rounded border px-2 text-[11px] leading-none ${t === tab ? "border-[#1B1A17] bg-[#1B1A17] text-white" : "border-[#E3E0D5] bg-white text-[#6E6B60] hover:text-[#1B1A17]"}`}
            >
              {TAB_LABEL[t]}
              {t === "violations" && mine.length > 0 && <span className="ml-1 font-semibold text-[#B23A22]">{mine.length}</span>}
            </button>
          ))}
        </div>
      )}

      <div id="drawer-panel" role={ev ? "tabpanel" : undefined} aria-labelledby={ev ? `drawer-tab-${tab}` : undefined} tabIndex={ev ? 0 : undefined} className="min-h-0 flex-1 overflow-y-auto outline-none">
        {rewound && <Empty>Event #{selected} has not happened yet at this point in the Replay.</Empty>}
        {!ev && !rewound && selected === "start" && (
          <Section title="Task Brief">
            <p className="whitespace-pre-wrap">{run.taskBrief}</p>
          </Section>
        )}
        {!ev && !rewound && selected === "end" && <EndOfRun run={run} outcome={outcome} scoreReady={scoreReady} />}
        {ev && tab === "details" && <Details ev={ev} />}
        {ev && tab === "violations" &&
          (mine.length === 0 ? (
            <Empty>No Violations on this Event.</Empty>
          ) : (
            <div className="p-3">
              <ViolationCard violations={mine} sourceSeq={sourceSeq} onJump={onJump} injectedLabel={injectedLabel} className="" />
            </div>
          ))}
        {ev && tab === "injected" && <Injected run={run} ev={ev} />}
      </div>

      <footer className={`border-t border-[#E3E0D5] px-3 py-1.5 text-[10px] ${MUTED}`}>
        <kbd className={mono}>←</kbd> <kbd className={mono}>→</kbd> move · <kbd className={mono}>Esc</kbd> close
      </footer>
    </aside>
  );
}

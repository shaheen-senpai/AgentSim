"use client";
// The Event drawer (design/agentsim-console.html 1345-1360): a fixed right panel over a backdrop.
// The mock shows Input, Result and Source; the Violations on the Event and the injected text in
// context (the product's core explanation) follow in the same visual language. Escape closes,
// ←/→ walk the visible Events.
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import type { Event, RunRecord, ToolDef } from "@/ui/types";
import { injectedText, locateInjection } from "./injected";
import { clockTime, prettyJson } from "@/ui/format";
import { systemColor } from "@/ui/systemColor";
import { ViolationCard } from "@/ui/ViolationCard";
import { eventFlags } from "./eventFlags";

export type EventDrawerProps = {
  run: RunRecord;
  event: Event;
  /** The Events currently on screen (the replay prefix) — what ←/→ walk. */
  events: Event[];
  tools: Record<string, ToolDef>;
  systems: string[];
  injectedLabel: string;
  onClose: () => void;
  onSelect: (seq: number) => void;
};

const PRE: CSSProperties = { whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 256, overflow: "auto", margin: 0 };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="drawer-field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function EventDrawer({ run, event: ev, events, tools, systems, injectedLabel, onClose, onSelect }: EventDrawerProps) {
  const flags = eventFlags(ev, run.violations, run.attack);
  const mine = run.violations.filter((v) => v.eventSeq === ev.seq);
  // The Violations card offers a jump to where the injected content was actually read.
  const injectionSeq = events.find((e) => e.injected !== null)?.seq;
  const sourceSeq = run.attack && mine.length > 0 && injectionSeq !== undefined && injectionSeq !== ev.seq ? injectionSeq : undefined;
  const system = tools[ev.tool]?.system;
  const colour = system ? systemColor(systems, system) : null;
  const text = run.attack ? injectedText(run.attack) : "";
  const injected = ev.injected;
  const context = useMemo(() => (injected ? locateInjection(ev.result, injected, text) : null), [ev.result, injected, text]);

  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, [ev.seq]);

  useEffect(() => {
    const step = (dir: 1 | -1) => {
      const at = events.findIndex((e) => e.seq === ev.seq);
      const next = events[at + dir];
      if (next) onSelect(next.seq);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        step(e.key === "ArrowRight" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [events, ev.seq, onClose, onSelect]);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside ref={panel} tabIndex={-1} className="drawer" role="dialog" aria-label={`Event #${ev.seq} · ${ev.tool}`} style={{ outline: "none" }}>
        <button type="button" className="close" onClick={onClose} aria-label="Close details">✕</button>
        <div className="field-label">Event #{ev.seq}</div>
        <h3>{ev.tool}</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          {colour && system && <span className="system-chip" style={{ background: colour.bg, color: colour.fg, margin: 0 }}>{system}</span>}
          {flags.injected && <span className="pill-badge badge-danger">Injected content read here</span>}
          {flags.violation && <span className="pill-badge badge-danger">Violation</span>}
          {flags.lure && <span className="pill-badge badge-danger">Lure taken</span>}
          {flags.error && <span className="pill-badge badge-neutral">error</span>}
        </div>

        <Field label="Input">
          <pre className="val" style={PRE}>{JSON.stringify(ev.input, null, 2)}</pre>
        </Field>
        <Field label={ev.error ? "Error" : "Result"}>
          <pre className="val" style={ev.error ? { ...PRE, color: "var(--danger-fg)" } : PRE}>{ev.error ?? (ev.result ? prettyJson(ev.result) : "ok")}</pre>
        </Field>
        <Field label="Source">
          <div className="val">{ev.source}{flags.injected ? " · read tool, this Run's Attack surfaced text here" : ""}</div>
        </Field>
        <Field label={`Changes · ${ev.changes.length}`}>
          <div className="val">
            {ev.changes.length === 0
              ? "No World changes."
              : ev.changes.map((c, i) => (
                  <div key={i}>
                    {c.collection ? <><b style={{ textTransform: "uppercase" }}>{c.op}</b> {c.collection} </> : null}
                    <span style={{ color: c.collection ? "var(--muted)" : undefined }}>{c.id}</span>
                  </div>
                ))}
          </div>
        </Field>
        <Field label="Timing">
          <div className="val">
            started {clockTime(ev.startedAt)} · ended {clockTime(ev.endedAt)} · {ev.endedAt - ev.startedAt} ms · batch {ev.batchId ?? "—"}
          </div>
        </Field>

        {mine.length > 0 && (
          <div className="drawer-field">
            <label>Violations · {mine.length}</label>
            <ViolationCard violations={mine} sourceSeq={sourceSeq} onJump={onSelect} injectedLabel={injectedLabel} className="" />
          </div>
        )}

        {injected && (
          <Field label={`Injected by Attack · ${injected.attackId} · ${injected.collection}/${injected.id}.${injected.field}`}>
            <pre className="val" style={{ ...PRE, maxHeight: 320 }}>
              {context ? (
                <>
                  {context.before}
                  <mark style={{ background: "var(--danger-bg)", color: "var(--danger-fg)", fontWeight: 600 }}>{context.match}</mark>
                  {context.after}
                </>
              ) : (
                text || "This Run no longer carries the Attack that wrote here, so the injected text cannot be shown."
              )}
            </pre>
          </Field>
        )}

        <p style={{ fontSize: 10, color: "var(--muted)", margin: "6px 0 0" }}>
          <kbd className="mono">←</kbd> <kbd className="mono">→</kbd> move · <kbd className="mono">Esc</kbd> close
        </p>
      </aside>
    </>
  );
}

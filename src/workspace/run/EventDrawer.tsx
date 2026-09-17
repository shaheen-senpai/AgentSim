"use client";
// One Event, in a panel over the page: Input, Result, Source, Changes, Timing, the Violations on it
// and the injected text in context — the product's core explanation. Escape closes, ←/→ walk the
// visible Events.
import { useEffect, useMemo, useRef } from "react";
import { Icon } from "@/marketing/icons";
import { clockTime, prettyJson } from "@/ui/format";
import { eventFlags } from "@/ui/run/eventFlags";
import { injectedText, locateInjection } from "@/ui/run/injected";
import { systemColor } from "@/ui/systemColor";
import type { Event, RunRecord, ToolDef } from "@/ui/types";
import { eyebrow } from "../ui";
import { Badge, Field, valueBox } from "./bits";
import { ViolationList } from "./ViolationList";

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

const pre = `${valueBox} m-0 max-h-64 overflow-auto whitespace-pre-wrap [word-break:break-word]`;

export function EventDrawer({ run, event: ev, events, tools, systems, injectedLabel, onClose, onSelect }: EventDrawerProps) {
  const flags = eventFlags(ev, run.violations, run.attack);
  const mine = run.violations.filter((v) => v.eventSeq === ev.seq);
  const injectionSeq = events.find((e) => e.injected !== null)?.seq;
  const sourceSeq = run.attack && mine.length > 0 && injectionSeq !== undefined && injectionSeq !== ev.seq ? injectionSeq : undefined;
  const system = tools[ev.tool]?.system;
  const colour = system ? systemColor(systems, system) : null;
  const text = run.attack ? injectedText(run.attack) : "";
  const injected = ev.injected;
  const context = useMemo(() => (injected ? locateInjection(ev.result, injected, text) : null), [ev.result, injected, text]);

  const at = events.findIndex((e) => e.seq === ev.seq);
  const prev = events[at - 1];
  const next = events[at + 1];

  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, [ev.seq]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const to = e.key === "ArrowRight" ? next : prev;
        if (to) onSelect(to.seq);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, onClose, onSelect]);

  const stepButton = "grid size-9 cursor-pointer place-items-center rounded-control border border-border text-muted-foreground transition-colors duration-200 hover:border-primary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="animate-fade-in absolute inset-0 bg-background/25" onMouseDown={onClose} aria-hidden />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Event #${ev.seq} · ${ev.tool}`}
        className="animate-pop-in absolute inset-y-0 right-0 w-full max-w-[460px] overflow-y-auto border-l border-border bg-surface p-5 shadow-[-24px_0_64px_rgba(0,0,0,0.6)] outline-none sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={eyebrow}>Event #{ev.seq}</p>
            <h2 className="mt-1 truncate font-heading text-h3 font-semibold">{ev.tool}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => prev && onSelect(prev.seq)} disabled={!prev} aria-label="Previous event" className={stepButton}><Icon name="arrow-left" className="size-4" /></button>
            <button type="button" onClick={() => next && onSelect(next.seq)} disabled={!next} aria-label="Next event" className={stepButton}><Icon name="arrow-right" className="size-4" /></button>
            <button type="button" onClick={onClose} aria-label="Close details" className={stepButton}><Icon name="close" className="size-4" /></button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {colour && system && (
            <Badge tone="muted" className="gap-1.5 text-foreground"><span className="size-1.5 rounded-full" style={{ background: colour.fg }} aria-hidden />{system}</Badge>
          )}
          {flags.injected && <Badge tone="danger">Injected content read here</Badge>}
          {flags.violation && <Badge tone="danger">Violation</Badge>}
          {flags.lure && <Badge tone="danger">Lure taken</Badge>}
          {flags.error && <Badge tone="muted">error</Badge>}
        </div>

        <Field label="Input">
          <pre className={pre}>{JSON.stringify(ev.input, null, 2)}</pre>
        </Field>
        <Field label={ev.error ? "Error" : "Result"}>
          <pre className={`${pre} ${ev.error ? "text-danger" : ""}`}>{ev.error ?? (ev.result ? prettyJson(ev.result) : "ok")}</pre>
        </Field>
        <Field label="Source">
          <div className={valueBox}>{ev.source}{flags.injected ? " · read tool, this Run's Attack surfaced text here" : ""}</div>
        </Field>
        <Field label={`Changes · ${ev.changes.length}`}>
          <div className={valueBox}>
            {ev.changes.length === 0
              ? "No World changes."
              : ev.changes.map((c, i) => (
                  <div key={i}>
                    {c.collection ? <><b className="uppercase">{c.op}</b> {c.collection} </> : null}
                    <span className={c.collection ? "text-muted-foreground" : ""}>{c.id}</span>
                  </div>
                ))}
          </div>
        </Field>
        <Field label="Timing">
          <div className={valueBox}>
            started {clockTime(ev.startedAt)} · ended {clockTime(ev.endedAt)} · {ev.endedAt - ev.startedAt} ms · batch {ev.batchId ?? "—"}
          </div>
        </Field>

        {mine.length > 0 && (
          <Field label={`Violations · ${mine.length}`}>
            <ViolationList violations={mine} sourceSeq={sourceSeq} onJump={onSelect} injectedLabel={injectedLabel} />
          </Field>
        )}

        {injected && (
          <Field label={`Injected by Attack · ${injected.attackId} · ${injected.collection}/${injected.id}.${injected.field}`}>
            <pre className={`${pre} max-h-80`}>
              {context ? (
                <>
                  {context.before}
                  <mark className="rounded-[3px] bg-danger/20 px-0.5 font-semibold text-danger">{context.match}</mark>
                  {context.after}
                </>
              ) : (
                text || "This Run no longer carries the Attack that wrote here, so the injected text cannot be shown."
              )}
            </pre>
          </Field>
        )}

        <p className="mt-5 font-label text-[10px] text-muted-foreground">
          <kbd className="rounded-[3px] border border-border px-1">←</kbd> <kbd className="rounded-[3px] border border-border px-1">→</kbd> move · <kbd className="rounded-[3px] border border-border px-1">Esc</kbd> close
        </p>
      </aside>
    </div>
  );
}

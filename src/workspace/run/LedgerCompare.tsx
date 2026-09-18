"use client";
// `/runs/[id]/compare` — the ledger comparison as its own page: any two of the Run's three World
// ledgers (the pack's Seed, the start Snapshot the Attack left, the end Snapshot the agent left)
// compared one block per row that differs, one line per field that moved, with before and after
// side by side. The Attack's injection point is amber, a row a violating Event wrote is red, and a
// row written by the Event that took the Lure says so — the reader sees where the Attack got in and
// whether it landed. All the data comes from `@/ui/run/ledgerCompare`; this file only lays it out.
import Link from "next/link";
import { useMemo, useState } from "react";
import { injectedText } from "@/engine/lure";
import type { Snapshot } from "@/engine/types";
import { Icon } from "@/marketing/icons";
import { agentLabel } from "@/runner/agentRef";
import {
  availableModes,
  compareLedgers,
  compareSummary,
  ledgerMarks,
  modeLedgers,
  visibleRows,
  type CellDiff,
  type CollectionCompare,
  type EntityRef,
  type RowCompare,
  type RowStatus,
} from "@/ui/run/ledgerCompare";
import type { RunRecord } from "@/ui/types";
import { card, container, eyebrow, tag } from "../ui";
import { Badge, Flag } from "./bits";
import { runNav } from "./runView";

export type LedgerComparePageProps = {
  run: RunRecord;
  /** The pack's pristine Seed, recomputed on the server; null when the pack is gone. */
  seedSnapshot: Snapshot | null;
  /** The pack's entities in declaration order, for table order and labels. */
  entities: EntityRef[];
  /** The registry agent a BYO Run belongs to, when it still exists; the breadcrumb walks through it. */
  agent: { id: string; name: string } | null;
  /** The `?mode=` the page opened with, when it names an available comparison. */
  initialMode?: string | null;
};

const STATUS: Record<RowStatus, { glyph: string; text: string; tone: string }> = {
  added: { glyph: "+", text: "added", tone: "text-primary" },
  removed: { glyph: "−", text: "removed", tone: "text-danger" },
  changed: { glyph: "~", text: "changed", tone: "text-warning" },
  unchanged: { glyph: "=", text: "unchanged", tone: "text-muted-foreground" },
};

const LONG = 280;

function fmt(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** A cell value: `—` when absent, clamped when long, with the injected text marked when it is there. */
function Value({ value, mark, expanded, onToggle }: { value: unknown; mark: string | null; expanded: boolean; onToggle: () => void }) {
  const text = fmt(value);
  if (text === null) return <span className="text-muted-foreground/60">—</span>;
  const long = text.length > LONG;
  const shown = long && !expanded ? `${text.slice(0, LONG)}…` : text;
  const at = mark ? shown.indexOf(mark) : -1;
  return (
    <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">
      {mark && at >= 0 ? (
        <>
          {shown.slice(0, at)}
          <mark className="rounded-[3px] bg-warning/25 px-0.5 text-foreground">{mark}</mark>
          {shown.slice(at + mark.length)}
        </>
      ) : (
        shown
      )}
      {long && (
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="ml-1.5 cursor-pointer font-label text-[10px] uppercase text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
          {expanded ? "less" : "more"}
        </button>
      )}
    </span>
  );
}

function Cell({ cell, rowKey, mark, expanded, toggle }: { cell: CellDiff; rowKey: string; mark: string | null; expanded: Set<string>; toggle: (k: string) => void }) {
  const kb = `${rowKey}/${cell.field}/b`, ka = `${rowKey}/${cell.field}/a`;
  const tone = cell.injected ? "bg-warning/10" : cell.changed ? "bg-surface-raised/40" : "";
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-1 px-4 py-2 font-label text-caption sm:grid-cols-[minmax(120px,180px)_minmax(0,1fr)_minmax(0,1fr)] ${tone}`}>
      <span className="flex min-w-0 items-start gap-1.5 text-muted-foreground">
        <span className="truncate">{cell.field}</span>
        {cell.injected && <Flag tone="danger">injected</Flag>}
      </span>
      <span className={`min-w-0 ${cell.changed ? "text-muted-foreground line-through decoration-danger/50" : "text-foreground"}`}>
        <span className="mr-2 font-label text-[10px] uppercase text-muted-foreground/70 sm:hidden">before</span>
        <Value value={cell.before} mark={null} expanded={expanded.has(kb)} onToggle={() => toggle(kb)} />
      </span>
      <span className="min-w-0 text-foreground">
        <span className="mr-2 font-label text-[10px] uppercase text-muted-foreground/70 sm:hidden">after</span>
        <Value value={cell.after} mark={cell.injected ? mark : null} expanded={expanded.has(ka)} onToggle={() => toggle(ka)} />
      </span>
    </li>
  );
}

function RowBlock({ row, collection, mark, changedOnly, expanded, toggle }: { row: RowCompare; collection: string; mark: string | null; changedOnly: boolean; expanded: Set<string>; toggle: (k: string) => void }) {
  const s = STATUS[row.status];
  const bad = row.marks.violation || row.marks.lure;
  const cells = changedOnly && row.status !== "added" && row.status !== "removed" ? row.cells.filter((c) => c.changed || c.injected) : row.cells;
  const frame = bad ? "border-danger/50 bg-danger/5" : row.marks.injected ? "border-warning/50 bg-warning/5" : "border-border";
  const rowKey = `${collection}/${row.id}`;
  return (
    <li className={`min-w-0 overflow-hidden rounded-control border ${frame}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2">
        <span className={`w-3 font-label font-bold ${s.tone}`} aria-hidden>{s.glyph}</span>
        <span className="font-label text-caption text-foreground">{row.id}</span>
        <span className={`font-label text-[10px] uppercase ${s.tone}`}>{s.text}</span>
        <span className="ml-auto inline-flex flex-wrap items-center gap-1.5">
          {row.marks.injected && <Badge tone="warning">Attack injected here</Badge>}
          {row.marks.lure && <Badge tone="danger">Lure taken</Badge>}
          {row.marks.violation && !row.marks.lure && <Badge tone="danger">Violation</Badge>}
        </span>
      </div>
      {cells.length > 0 ? (
        <ul className="divide-y divide-border/40 py-1">
          <li className="hidden px-4 pb-1 pt-1.5 font-label text-[10px] uppercase text-muted-foreground/70 sm:grid sm:grid-cols-[minmax(120px,180px)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-4" aria-hidden>
            <span>field</span><span>before</span><span>after</span>
          </li>
          {cells.map((c) => <Cell key={c.field} cell={c} rowKey={rowKey} mark={mark} expanded={expanded} toggle={toggle} />)}
        </ul>
      ) : (
        <p className="px-4 py-2 font-label text-caption text-muted-foreground">No field moved in this comparison.</p>
      )}
    </li>
  );
}

function CollectionBlock({ c, mark, changedOnly, expanded, toggle }: { c: CollectionCompare; mark: string | null; changedOnly: boolean; expanded: Set<string>; toggle: (k: string) => void }) {
  const rows = visibleRows(c.rows, changedOnly);
  if (rows.length === 0) return null;
  const parts = [c.counts.added && `+${c.counts.added}`, c.counts.changed && `~${c.counts.changed}`, c.counts.removed && `−${c.counts.removed}`].filter(Boolean);
  return (
    <section className={`${card} min-w-0 p-5`} aria-labelledby={`ledger-${c.collection}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 id={`ledger-${c.collection}`} className="font-heading text-h3 font-semibold text-foreground">{c.label}</h2>
        <span className="font-label text-[11px] text-muted-foreground">{c.collection} · {parts.length ? parts.join(" ") : "no change"} · {c.counts.unchanged} unchanged</span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((r) => <RowBlock key={r.id} row={r} collection={c.collection} mark={mark} changedOnly={changedOnly} expanded={expanded} toggle={toggle} />)}
      </ul>
    </section>
  );
}

export function LedgerComparePage({ run, seedSnapshot, entities, agent, initialMode = null }: LedgerComparePageProps) {
  const ledgers = useMemo(() => ({ seed: seedSnapshot, start: run.startSnapshot, end: run.endSnapshot }), [seedSnapshot, run.startSnapshot, run.endSnapshot]);
  const modes = useMemo(() => availableModes(ledgers), [ledgers]);
  const [modeKey, setModeKey] = useState<string>(() => {
    if (initialMode && modes.some((m) => m.key === initialMode)) return initialMode;
    return modes.some((m) => m.key === "start-end") ? "start-end" : modes[0]?.key ?? "";
  });
  const mode = modes.find((m) => m.key === modeKey) ?? modes[0] ?? null;
  const [changedOnly, setChangedOnly] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) => setExpanded((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const marks = useMemo(() => ledgerMarks(run), [run]);
  const collections = useMemo(() => {
    if (!mode) return [];
    const { from, to } = modeLedgers(mode, ledgers);
    return compareLedgers(entities, from, to, marks);
  }, [mode, ledgers, entities, marks]);
  const summary = compareSummary(collections);
  const mark = run.attack ? injectedText(run.attack) : null;
  const anyVisible = collections.some((c) => visibleRows(c.rows, changedOnly).length > 0);

  const runHref = `/runs/${run.id}`;
  const nav = runNav(run, agent);
  const segment = (active: boolean) =>
    `cursor-pointer rounded-control px-3 py-1.5 font-label text-[11px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ring ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <main id="main" className={`${container} pb-20 pt-8`}>
      <Link href={runHref} className={`${eyebrow} inline-flex items-center gap-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring`}>
        <Icon name="arrow-left" className="size-3.5" /> Back to run
      </Link>
      <nav aria-label="Breadcrumb" className="mt-4 flex flex-wrap items-center gap-2 text-body text-muted-foreground">
        {[...nav.crumbs.map((c, i) => (i === nav.crumbs.length - 1 ? { ...c, href: runHref } : c)), { label: "Compare ledgers" }].map((c, i) => (
          <span key={i} className="contents">
            {i > 0 && <span aria-hidden>/</span>}
            {c.href ? <Link href={c.href} className="hover:text-foreground">{c.label}</Link> : <span className="font-medium text-foreground">{c.label}</span>}
          </span>
        ))}
      </nav>

      <header className="animate-reveal mt-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={tag}>{run.packName}</span>
          <h1 className="font-heading text-display font-semibold">Before and after</h1>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-label text-[11px] text-muted-foreground">{run.id}</span>
          <span className="text-muted-foreground" aria-hidden>·</span>
          <span className={tag}>{run.scenarioTitle}</span>
          <span className={tag}>Agent · {agentLabel(run.agent)}</span>
          <Badge tone={run.attack ? "danger" : "muted"}>Attack · {run.attack ? run.attack.id : "off"}</Badge>
        </div>
      </header>

      {mode === null ? (
        <p className={`${card} mt-6 p-6 text-body text-muted-foreground`}>Nothing to compare yet: this Run has no end Snapshot and its pack could not be loaded.</p>
      ) : (
        <>
          <section className={`${card} animate-reveal mt-6 p-4 [animation-delay:80ms]`} aria-label="Comparison controls">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex gap-1 rounded-control border border-border p-0.5" role="tablist" aria-label="Ledgers to compare">
                {modes.map((m) => (
                  <button key={m.key} type="button" role="tab" aria-selected={m.key === mode.key} onClick={() => setModeKey(m.key)} className={segment(m.key === mode.key)}>
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-caption text-muted-foreground">{mode.hint}</p>
              <button
                type="button"
                aria-pressed={changedOnly}
                onClick={() => setChangedOnly((v) => !v)}
                className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-control border border-border px-3 py-1.5 font-label text-[11px] text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary/60 aria-pressed:bg-primary/10 aria-pressed:text-primary"
              >
                <Icon name="check" className={`size-3 ${changedOnly ? "" : "opacity-0"}`} /> Changed rows only
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
              <span className={eyebrow}>
                <span className="text-primary">+{summary.added}</span> added · <span className="text-warning">~{summary.changed}</span> changed · <span className="text-danger">−{summary.removed}</span> removed · {summary.unchanged} unchanged
              </span>
              <span className="ml-auto inline-flex flex-wrap items-center gap-1.5" aria-label="Legend">
                <Badge tone="warning">Attack injected here</Badge>
                <Badge tone="danger">Violation</Badge>
                <Badge tone="danger">Lure taken</Badge>
                <span className="font-label text-[11px] text-muted-foreground">{summary.marked} marked</span>
              </span>
            </div>
          </section>

          <div className="animate-reveal mt-4 [animation-delay:160ms]">
            {anyVisible ? (
              <div className="flex flex-col gap-4">
                {collections.map((c) => <CollectionBlock key={c.collection} c={c} mark={mark} changedOnly={changedOnly} expanded={expanded} toggle={toggle} />)}
              </div>
            ) : (
              <p className={`${card} p-8 text-center text-body text-muted-foreground`}>
                {mode.key === "seed-start" && !run.attack ? "No Attack on this Run — the start ledger is the Seed." : "Nothing differs between these two ledgers."}
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}

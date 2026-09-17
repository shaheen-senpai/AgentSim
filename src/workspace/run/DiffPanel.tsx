"use client";
// The World diff card: one row per added or changed entity, red when a violating Event changed it,
// then the unchanged count and how many reads left the Run's principal. Its header opens the ledger
// comparison — the same three ledgers, field by field.
import { useState } from "react";
import type { Snapshot } from "@/engine/types";
import { Icon } from "@/marketing/icons";
import { countReadsOutside, readsOutsideLabel } from "@/ui/diffSummary";
import { flaggedEntityIds } from "@/ui/run/eventFlags";
import { availableModes, type EntityRef } from "@/ui/run/ledgerCompare";
import type { RunRecord } from "@/ui/types";
import { card, eyebrow } from "../ui";
import { LedgerCompare } from "./LedgerCompare";

export type DiffPanelProps = {
  run: RunRecord;
  principalLabel: string;
  /** The pack's pristine Seed, for the Seed → Start and Seed → End comparisons; null when the pack is gone. */
  seedSnapshot: Snapshot | null;
  entities: EntityRef[];
};

export function DiffPanel({ run, principalLabel, seedSnapshot, entities }: DiffPanelProps) {
  const diff = run.diff ?? [];
  const flagged = flaggedEntityIds(run);
  const [comparing, setComparing] = useState(false);
  const canCompare = availableModes({ seed: seedSnapshot, start: run.startSnapshot, end: run.endSnapshot }).length > 0;
  return (
    <section className={`${card} min-w-0 overflow-hidden`} aria-labelledby="run-diff-title">
      <div className="flex items-center gap-2 px-5 pt-5">
        <h2 id="run-diff-title" className={eyebrow}>World diff · start → end</h2>
        <button
          type="button"
          onClick={() => setComparing(true)}
          disabled={!canCompare}
          className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-border px-2.5 py-1 font-label text-[11px] text-muted-foreground transition-colors duration-200 hover:border-primary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="compare" className="size-3.5" /> Compare ledgers
        </button>
      </div>
      <ul className="mt-3 divide-y divide-border border-t border-border text-caption">
        {run.status === "running" ? (
          <li className="flex gap-3 px-5 py-2.5 text-muted-foreground"><span className="w-3 shrink-0 font-bold">…</span><span>World is changing…</span></li>
        ) : (
          <>
            {diff.map((d) => {
              const bad = flagged.has(d.entityId);
              const tone = bad ? "bg-danger/10" : d.op === "added" ? "bg-primary/10" : "bg-warning/10";
              return (
                <li key={`${d.collection}-${d.entityId}`} className={`flex items-start gap-3 px-5 py-2.5 ${tone}`}>
                  <span className={`w-3 shrink-0 font-label font-bold ${bad ? "text-danger" : d.op === "added" ? "text-primary" : "text-warning"}`}>{d.op === "added" ? "+" : "~"}</span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]"><span className="font-label text-foreground">{d.entityId}</span> <span className="text-muted-foreground">— {d.summary}</span></span>
                  {bad && <span className="shrink-0 font-label text-[10px] uppercase text-danger">violation</span>}
                </li>
              );
            })}
            <li className="flex gap-3 px-5 py-2.5 text-muted-foreground">
              <span className="w-3 shrink-0 font-label font-bold">=</span>
              <span className="min-w-0 [overflow-wrap:anywhere]">{run.unchangedCount ?? 0} entities unchanged · {readsOutsideLabel(countReadsOutside(run.violations), principalLabel)}</span>
            </li>
          </>
        )}
      </ul>
      {comparing && <LedgerCompare open onClose={() => setComparing(false)} run={run} seedSnapshot={seedSnapshot} entities={entities} />}
    </section>
  );
}

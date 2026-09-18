// The World diff card: one row per added or changed entity, red when a violating Event changed it,
// then the unchanged count and how many reads left the Run's principal. Its header links to the
// ledger comparison page — the same World, field by field, before and after.
import Link from "next/link";
import { Icon } from "@/marketing/icons";
import { countReadsOutside, readsOutsideLabel } from "@/ui/diffSummary";
import { flaggedEntityIds } from "@/ui/run/eventFlags";
import type { RunRecord } from "@/ui/types";
import { card, eyebrow } from "../ui";

export type DiffPanelProps = {
  run: RunRecord;
  principalLabel: string;
  /** Where "Compare ledgers" goes; null when the Run has nothing to compare yet (no end Snapshot and no pack). */
  compareHref: string | null;
};

const compareLink = "ml-auto inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1 font-label text-[11px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ring";

export function DiffPanel({ run, principalLabel, compareHref }: DiffPanelProps) {
  const diff = run.diff ?? [];
  const flagged = flaggedEntityIds(run);
  return (
    <section className={`${card} min-w-0 overflow-hidden`} aria-labelledby="run-diff-title">
      <div className="flex items-center gap-2 px-5 pt-5">
        <h2 id="run-diff-title" className={eyebrow}>World diff · start → end</h2>
        {compareHref ? (
          <Link href={compareHref} className={`${compareLink} text-muted-foreground hover:border-primary/60 hover:text-foreground`}>
            <Icon name="compare" className="size-3.5" /> Compare ledgers
          </Link>
        ) : (
          <span className={`${compareLink} cursor-not-allowed text-muted-foreground opacity-50`} aria-disabled="true" title="Available once the Run has an end Snapshot">
            <Icon name="compare" className="size-3.5" /> Compare ledgers
          </span>
        )}
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
    </section>
  );
}

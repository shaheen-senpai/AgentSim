// The World diff panel body (design/agentsim-console.html 1334-1343, over the real `run.diff`):
// one row per added or changed entity, red when a violating Event changed it, then the
// unchanged count and how many reads left the Run's principal.
import type { RunRecord } from "@/ui/types";
import { countReadsOutside, readsOutsideLabel } from "@/ui/diffSummary";
import { flaggedEntityIds } from "./eventFlags";

export function DiffPanel({ run, principalLabel }: { run: RunRecord; principalLabel: string }) {
  if (run.status === "running") {
    return (
      <div className="diff-row" style={{ color: "var(--muted)" }}>
        <span className="op">…</span>
        <span>World is changing…</span>
      </div>
    );
  }
  const diff = run.diff ?? [];
  const flagged = flaggedEntityIds(run);
  return (
    <>
      {diff.map((d) => {
        const bad = flagged.has(d.entityId);
        const tone = bad ? "var(--danger-bg)" : d.op === "added" ? "var(--success-bg)" : "var(--warning-bg)";
        return (
          <div key={`${d.collection}-${d.entityId}`} className="diff-row" style={{ background: tone }}>
            <span className="op">{d.op === "added" ? "+" : "~"}</span>
            <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
              <span className="mono">{d.entityId}</span> — {d.summary}
            </span>
            {bad && <span style={{ marginLeft: "auto", color: "var(--danger-fg)", fontSize: 11, flex: "none" }}>violation</span>}
          </div>
        );
      })}
      <div className="diff-row" style={{ color: "var(--muted)" }}>
        <span className="op">=</span>
        <span>
          {run.unchangedCount ?? 0} entities unchanged · {readsOutsideLabel(countReadsOutside(run.violations), principalLabel)}
        </span>
      </div>
    </>
  );
}

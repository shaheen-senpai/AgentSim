// Each Run's real World diff side by side (design/agentsim-console.html 1218-1229 for the layout).
// Same data `DiffPanel` renders for one Run, never re-derived; rows a violating Event changed are red.
import { agentLabel } from "@/runner/agentRef";
import type { RunRecord } from "@/ui/types";
import { runName } from "@/ui/format";
import { flaggedEntityIds } from "@/ui/run/eventFlags";

function Column({ run }: { run: RunRecord }) {
  const flagged = flaggedEntityIds(run);
  return (
    <div>
      <div className="ledger-col-label" style={{ color: "var(--muted)" }}>{runName(agentLabel(run.agent), run.attack?.id ?? null)}</div>
      {(run.diff ?? []).map((d) => {
        const bad = flagged.has(d.entityId);
        const tone = bad ? "var(--danger-bg)" : d.op === "added" ? "var(--success-bg)" : "var(--warning-bg)";
        return (
          <div key={`${d.collection}-${d.entityId}`} className="diff-row" style={{ background: tone, borderRadius: 6, marginBottom: 3, borderTop: "none" }}>
            <span className="op">{d.op === "added" ? "+" : "~"}</span>
            <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
              <span className="mono">{d.entityId}</span> — {d.summary}
            </span>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: "var(--muted)", padding: "4px 14px 0" }}>{run.unchangedCount ?? 0} entities unchanged</div>
    </div>
  );
}

export function WorldDiffCompare({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  return (
    <section className="panel card-pad">
      <h2 style={{ marginBottom: 10 }}>World diff — what each run left behind</h2>
      <div className="cmp-writes">
        <Column run={runA} />
        <Column run={runB} />
      </div>
    </section>
  );
}

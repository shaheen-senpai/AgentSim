// The two score cards at the top of Compare (design/agentsim-console.html `cmpCardHtml` 1106-1123).
import { agentLabel } from "@/runner/agentRef";
import type { RunRecord } from "@/ui/types";
import { outcomeBadge, runName } from "@/ui/format";

function Badge({ run }: { run: RunRecord }) {
  const s = run.score;
  if (!s) return null;
  if (s.capped) return <span className="pill-badge badge-danger">CAPPED</span>;
  if (s.passed) return <span className="pill-badge badge-success">PASS</span>;
  return <span className="pill-badge badge-warning">{(outcomeBadge(s.outcome) ?? "Violations").toUpperCase()}</span>;
}

function Card({ run, side, other }: { run: RunRecord; side: "A" | "B"; other?: RunRecord }) {
  const headline = run.score?.headline ?? null;
  const delta = other && headline !== null && other.score ? headline - other.score.headline : 0;
  return (
    <div className="panel cmp-card">
      <div className="side">Run {side}</div>
      <h3>{runName(agentLabel(run.agent), run.attack?.id ?? null)}</h3>
      <div className="rid">{run.id}</div>
      <div className="facts">
        <span className="mini-tag">{agentLabel(run.agent)}</span>
        <span className="mini-tag" style={run.attack ? { color: "var(--danger-fg)", borderColor: "var(--danger-fg)" } : undefined}>
          {run.attack ? `Attack: ${run.attack.id}` : "no Attack"}
        </span>
        <span className="mini-tag">{run.packName}</span>
        <span className="mini-tag">{run.events.length} events</span>
      </div>
      <div className="cmp-score">
        <span className="n" style={run.score?.capped ? { color: "var(--danger-fg)" } : undefined}>{headline ?? "—"}</span>
        <Badge run={run} />
        {other && delta !== 0 && (
          <span className={delta > 0 ? "delta-up" : "delta-down"} style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
            {delta > 0 ? "+" : ""}{delta} vs A
          </span>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "10px 0 0" }}>{run.scenarioTitle}</p>
    </div>
  );
}

export function CompareCards({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  return (
    <div className="cmp-cards">
      <Card run={runA} side="A" />
      <Card run={runB} side="B" other={runA} />
    </div>
  );
}

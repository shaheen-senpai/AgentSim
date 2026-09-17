// The Trust Score panel body (design/agentsim-console.html 1324-1332): the headline, the cap and
// outcome badges, the narrative or the score's own sentence, and one bar per Dimension.
import { label } from "@/engine/dimensions";
import type { RunRecord } from "@/ui/types";
import { outcomeBadge, scoreSummary } from "@/ui/format";

const NOTE = { fontSize: 12, color: "var(--muted)", margin: "6px 0 0" } as const;

export function ScorePanel({ run, replaying }: { run: RunRecord; replaying: boolean }) {
  const score = run.score;
  if (run.status === "failed") return <p style={{ ...NOTE, color: "var(--danger-fg)" }}>Run failed: {run.error}</p>;
  if (run.status === "running" || replaying || !score) return <p style={NOTE}>{replaying ? "replaying…" : "evaluating…"}</p>;
  const badge = outcomeBadge(score.outcome);
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "6px 0 10px" }}>
        <span className="score-num" style={score.capped ? { color: "var(--danger-fg)" } : undefined}>{score.headline}</span>
        {score.capped && <span className="pill-badge badge-danger">CAPPED</span>}
        {badge && <span className="pill-badge badge-warning">{badge}</span>}
      </div>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 14px" }}>{run.narrative ?? scoreSummary(score)}</p>
      {score.dimensions.map((d) => (
        <div key={d.name} className="dim-bar-row">
          <div className="dtop">
            <span>{label(d.name)}</span>
            <span className={`mono${d.score < 100 ? " num-bad" : ""}`}>{d.score}</span>
          </div>
          <div className="dim-bar-track">
            <div className={`dim-bar-fill${d.score < 100 ? " bad" : ""}`} style={{ width: `${d.score}%` }} />
          </div>
        </div>
      ))}
    </>
  );
}

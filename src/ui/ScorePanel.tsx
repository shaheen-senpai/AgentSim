import { label } from "@/engine/dimensions";
import type { RunRecord } from "./types";
import { dangerPill, heading, mono, panel } from "./styles";

export function ScorePanel({ run, replaying }: { run: RunRecord | null; replaying: boolean }) {
  const score = run?.score ?? null;
  const pending = !run || run.status === "running" || replaying || !score;
  return (
    <section className={`${panel} p-4`}>
      <div className={heading}>Trust Score</div>
      {pending ? (
        <div className="py-6 text-[#6E6B60]">{run?.status === "failed" ? `Run failed: ${run.error}` : run ? "evaluating…" : "—"}</div>
      ) : (
        <>
          <div className="flex items-baseline gap-3 my-1">
            <span className={`${mono} text-[88px] leading-none font-bold tracking-tight ${score.capped ? "text-[#B23A22]" : ""}`}>{score.headline}</span>
            {score.capped && <span className={`px-2.5 py-1 ${dangerPill} text-xs font-bold tracking-[.08em] uppercase`}>Capped</span>}
          </div>
          <div className="text-xs text-[#6E6B60] mb-3">
            {score.capped ? `Mean ${Math.round(score.dimensions.reduce((s, d) => s + d.score, 0) / score.dimensions.length)} → capped at ${score.headline}: ${score.capReason}.` : "No Violations. Happy path completed within authority."}
          </div>
          {run.narrative && <p className="text-[13px] mt-2">{run.narrative}</p>}
          <div className="flex flex-col gap-2">
            {score.dimensions.map((d) => (
              <div key={d.name}>
                <div className="flex justify-between text-[13px] mb-1">
                  <span>{label(d.name)}</span>
                  <span className={`${mono} ${d.score < 100 ? "text-[#B23A22] font-bold" : ""}`}>{d.score} <span className="text-[#6E6B60] font-normal">{d.total === 0 ? "(no checks)" : `(${d.passed}/${d.total})`}</span></span>
                </div>
                <div className="h-2 bg-[#E3E0D5] rounded overflow-hidden"><div className={`h-full ${d.score < 100 ? "bg-[#B23A22]" : "bg-[#1B1A17]"}`} style={{ width: `${d.score}%` }} /></div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

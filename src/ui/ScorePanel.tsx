import { label } from "@/engine/dimensions";
import type { RunRecord } from "./types";
import { heading, mono, panel } from "./styles";

export function ScorePanel({ run, replaying }: { run: RunRecord | null; replaying: boolean }) {
  const score = run?.score ?? null;
  const pending = !run || run.status === "running" || replaying || !score;
  return (
    <section className={`${panel} p-4`}>
      <div className={heading}>Trust Score</div>
      {pending ? (
        <div className="py-6 text-[#6b6b66]">{run?.status === "failed" ? `Run failed: ${run.error}` : run ? "evaluating…" : "—"}</div>
      ) : (
        <>
          <div className="flex items-baseline gap-3 my-1">
            <span className={`${mono} text-[88px] leading-none font-bold tracking-tight ${score.capped ? "text-[#c8321e]" : ""}`}>{score.headline}</span>
            {score.capped && <span className="px-2.5 py-1 bg-[#c8321e] text-white text-xs font-bold tracking-[.08em] uppercase rounded-sm">Capped</span>}
          </div>
          <div className="text-xs text-[#6b6b66] mb-3">
            {score.capped ? `Mean ${Math.round(score.dimensions.reduce((s, d) => s + d.score, 0) / score.dimensions.length)} → capped at ${score.headline}: ${score.capReason}.` : "No Violations. Happy path completed within authority."}
          </div>
          {run.narrative && <p className="text-[13px] mt-2">{run.narrative}</p>}
          <div className="flex flex-col gap-2">
            {score.dimensions.map((d) => (
              <div key={d.name}>
                <div className="flex justify-between text-[13px] mb-1">
                  <span>{label(d.name)}</span>
                  <span className={`${mono} ${d.score < 100 ? "text-[#c8321e] font-bold" : ""}`}>{d.score} <span className="text-[#6b6b66] font-normal">{d.total === 0 ? "(no checks)" : `(${d.passed}/${d.total})`}</span></span>
                </div>
                <div className="h-2 bg-[#e6e6e2] rounded overflow-hidden"><div className={`h-full ${d.score < 100 ? "bg-[#c8321e]" : "bg-[#1d1d1b]"}`} style={{ width: `${d.score}%` }} /></div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

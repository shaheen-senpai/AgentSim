import { label } from "@/sim/dimensions";
import type { RunRecord } from "./types";
import { fmtArgs } from "./format";
import { heading, mono, panel } from "./styles";

export function CompareColumn({ run }: { run: RunRecord }) {
  const bad = new Set(run.violations.map((v) => v.eventSeq));
  const s = run.score;
  return (
    <div className="flex flex-col gap-3 overflow-hidden">
      <div className={`${panel} p-4 flex gap-4 items-center`}>
        <div className="w-40">
          <div className={heading}>{run.agent === "naive" ? "naïve" : run.agent} agent · {run.id.slice(0, 12)}</div>
          <div className="flex items-baseline gap-2">
            <span className={`${mono} text-[56px] font-extrabold leading-none ${s?.capped ? "text-[#c8321e]" : ""}`}>{s?.headline ?? "—"}</span>
            {s?.capped && <span className="px-2 py-0.5 bg-[#c8321e] text-white text-[11px] font-bold uppercase rounded-sm">Capped</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 flex-1">
          {s?.dimensions.map((d) => <span key={d.name} className={`text-xs px-1.5 py-0.5 border rounded ${d.score < 100 ? "border-[#c8321e] text-[#c8321e]" : "border-[#cfcfcb]"}`}>{label(d.name)} {d.score}</span>)}
        </div>
        <div className="text-xs text-[#6b6b66] w-72">{run.violations[0]?.message ?? "No Violations."}</div>
      </div>
      <div className={`${panel} flex-1 overflow-auto text-[13px]`}>
        {run.events.map((e) => (
          <div key={e.seq} className={`flex gap-3 px-3 py-1.5 border-t border-[#e6e6e2] ${bad.has(e.seq) ? "bg-[#fbeeea] border-l-[3px] border-l-[#c8321e]" : ""}`}>
            <span className="text-xs text-[#6b6b66] w-8">#{e.seq}</span>
            <span className={`${mono} font-semibold`}>{e.tool}</span>
            <span className={`${mono} text-[#6b6b66] truncate`}>{fmtArgs(e.input)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

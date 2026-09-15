import Link from "next/link";
import { label } from "@/engine/dimensions";
import { agentLabel } from "@/runner/agentRef";
import type { RunRecord } from "./types";
import { heading, mono, panel } from "./styles";

/**
 * A Compare column's score header: agent + a back-link to the Run, headline score, CAPPED badge,
 * Dimension chips, first Violation. `CompareRunColumn` puts this above that Run's flow.
 */
export function CompareColumn({ run }: { run: RunRecord }) {
  const s = run.score;
  return (
    <div className={`${panel} p-4 flex gap-4 items-center`}>
      <div className="w-40">
        <Link
          href={`/runs/${run.id}`}
          className={`${heading} block hover:text-[#1d1d1b] underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b]`}
        >
          {agentLabel(run.agent)} agent · {run.id.slice(0, 12)}
        </Link>
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
  );
}

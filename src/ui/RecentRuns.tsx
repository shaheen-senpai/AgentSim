import Link from "next/link";
import type { RunSummary } from "./types";
import { heading, mono, panel } from "./styles";

export function RecentRuns({ runs, currentId }: { runs: RunSummary[]; currentId: string | null }) {
  return (
    <section className={`${panel} p-4 flex-1 overflow-auto`}>
      <div className={`${heading} mb-2.5`}>Recent runs</div>
      <ul className="flex flex-col gap-2 text-[13px]">
        {runs.slice(0, 12).map((r) => (
          <li key={r.id}>
            <Link href={`/runs/${r.id}`} title={r.id} className={`flex flex-col gap-0.5 ${r.id === currentId ? "font-semibold" : ""}`}>
              <span className="truncate">
                {r.packId} · {r.scenarioId}
                {r.golden && <span className="ml-1 text-[10px] uppercase tracking-[.08em] border border-[#cfcfcb] rounded px-1">golden</span>}
              </span>
              <span className="flex justify-between gap-2 text-[#6b6b66]">
                <span className="truncate">{r.agentLabel} · {r.attackId ? "attack" : "clean"}</span>
                <span className={`${mono} shrink-0 flex items-center gap-1 ${r.capped ? "text-[#c8321e] font-bold" : ""}`}>
                  {r.status === "running" ? "…" : r.headline ?? "—"}
                  {r.capped && <span className="px-1 py-0.5 bg-[#c8321e] text-white text-[9px] font-bold uppercase rounded-sm">Capped</span>}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {runs.length === 0 && <li className="text-[#6b6b66]">No runs yet</li>}
      </ul>
    </section>
  );
}

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
            <Link href={`/runs/${r.id}`} className={`flex justify-between gap-2 ${r.id === currentId ? "font-semibold" : ""}`}>
              <span className={mono}>{r.id.slice(0, 12)}</span>
              <span className="text-[#6b6b66] truncate">{r.agent === "naive" ? "naïve" : r.agent} · {r.attackId ? "attack" : "clean"}</span>
              <span className={`${mono} ${r.capped ? "text-[#c8321e] font-bold" : ""}`}>{r.status === "running" ? "…" : r.headline ?? "—"}</span>
            </Link>
          </li>
        ))}
        {runs.length === 0 && <li className="text-[#6b6b66]">No runs yet</li>}
      </ul>
    </section>
  );
}

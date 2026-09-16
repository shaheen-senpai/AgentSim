// One World pack on `/worlds` (spec §6.2). A server component: it takes the already-computed
// `PackSummary` and renders it — no data loading, no client JS.
import Link from "next/link";
import type { PackSummary } from "@/lib/summaries";
import { mono } from "@/ui/styles";
import { countsLabel } from "./packView";

export function PackCard({ summary }: { summary: PackSummary }) {
  return (
    <Link
      href={`/worlds/${summary.id}`}
      className="bg-white border border-[#E3E0D5] rounded p-4 flex flex-col gap-2 hover:border-[#1B1A17] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B1A17]"
    >
      <div className="flex items-baseline gap-2">
        <h2 className="font-semibold text-[15px] truncate">{summary.name}</h2>
        <span className="text-[11px] border border-[#E3E0D5] rounded-full px-2 py-0.5 text-[#6E6B60] shrink-0">{summary.domain}</span>
      </div>
      <div className={`${mono} text-[11px] text-[#6E6B60]`}>{summary.id}</div>
      <p className="text-[13px] text-[#1B1A17] leading-snug">{summary.description}</p>
      <div className="mt-auto pt-2 border-t border-[#E3E0D5] text-[11px] text-[#6E6B60]">
        <div>{countsLabel(summary)}</div>
        <div>
          principal <span className={mono}>{summary.principal}</span>
        </div>
      </div>
    </Link>
  );
}

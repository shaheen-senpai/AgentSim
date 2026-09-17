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
    <div className={`${panel} p-4 flex flex-wrap gap-4 items-center`}>
      {/* `w-full sm:w-40 shrink-0` (not a bare `w-40`) plus the parent's `flex-wrap`: below `sm` — or
          whenever this column's own available width is narrower than the label+chips+violation
          minimum, e.g. a Compare page rendered at `md` where two of these sit side by side — this
          block takes its own full-width row instead of forcing the row wider than its container. */}
      <div className="w-full sm:w-40 shrink-0 min-w-0">
        <Link
          href={`/runs/${run.id}`}
          className={`${heading} block hover:text-[#1d1d1b] underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b]`}
        >
          {agentLabel(run.agent)} agent · {run.id.slice(0, 12)}
        </Link>
        <div className="flex flex-wrap items-baseline gap-2 min-w-0">
          {/* `text-[44px] sm:text-[56px]`, not a bare `text-[56px]`: below `sm`, this block is
              `w-full` (full column width, often under 100px once padding is subtracted at 400px),
              and a 3-digit score at 56px doesn't fit even a full-width block that narrow — it was
              spilling past its own card. 44px is the largest size that reliably fits "100" in that
              space; `sm:text-[56px]` restores the original size everywhere this block is fixed-width.
              `flex-wrap` on this row too: the "Capped" badge has no `truncate` (a badge word
              shouldn't ellipsis) and so a non-zero automatic min-width of its own — without wrap,
              a tight row squeezed nearly all its width onto the badge and left the score number a
              sliver (it has `truncate`, so its own automatic min-width is 0 and it absorbed the
              entire shrink first). Wrapping lets "Capped" drop to its own line instead. */}
          <span className={`${mono} text-[34px] sm:text-[56px] font-extrabold leading-none truncate ${s?.capped ? "text-[#c8321e]" : ""}`}>{s?.headline ?? "—"}</span>
          {s?.capped && <span className="px-2 py-0.5 bg-[#c8321e] text-white text-[11px] font-bold uppercase rounded-sm">Capped</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 flex-1 min-w-0">
        {s?.dimensions.map((d) => <span key={d.name} className={`text-xs px-1.5 py-0.5 border rounded ${d.score < 100 ? "border-[#c8321e] text-[#c8321e]" : "border-[#cfcfcb]"}`}>{label(d.name)} {d.score}</span>)}
      </div>
      <div className="text-xs text-[#6b6b66] w-full sm:w-72 shrink-0 min-w-0">{run.violations[0]?.message ?? "No Violations."}</div>
    </div>
  );
}

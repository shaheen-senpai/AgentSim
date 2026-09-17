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
    // `@container`, not just a wider `flex-wrap` row: this card's *available* width depends on
    // whether `/compare`'s own grid (`grid-cols-1 md:grid-cols-2` in `page.tsx`) has stacked to one
    // column or two, which a plain viewport breakpoint on this component can't see — a `sm:`/`md:`
    // override activates at a fixed viewport width regardless of whether the page just halved this
    // card's column at that same width. A `@lg:` *container* query instead asks "is this card's own
    // box actually wide enough", which is true either in the page's one-column state once the
    // viewport is wide enough, or in its two-column state once each half is — the two cases this
    // card actually needs to distinguish, not two arbitrary viewport widths that don't line up with
    // either. (An earlier version used `sm:` — wrong on its own; then `md:`, matching the page's own
    // breakpoint, which sounds right but isn't: right at `md` the page's grid *also* switches from
    // one column to two, halving this card's own width at that exact instant, so a plain `md:`
    // override went fixed-width at precisely the moment there was *less* room, not more — confirmed
    // by measuring a Run column at 850px: only 274px wide, yet the Violation block alone was a fixed
    // 288px, wider than the card itself. `@lg` (512px container width) sits just under the ~549px
    // per column measured at a 1400px viewport — the width this layout was already proven to work
    // at — so it activates there but stays off in the genuinely-narrow 768-1300px window.)
    <div className={`${panel} p-4 flex flex-wrap gap-4 items-center @container`}>
      <div className="w-full @lg:w-40 shrink-0 min-w-0">
        <Link
          href={`/runs/${run.id}`}
          className={`${heading} block hover:text-[#1d1d1b] underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b]`}
        >
          {agentLabel(run.agent)} agent · {run.id.slice(0, 12)}
        </Link>
        <div className="flex flex-wrap items-baseline gap-2 min-w-0">
          {/* `text-[34px] @lg:text-[56px]`: below the same `@lg` container threshold, this block is
              `w-full` and can be as narrow as ~80px once padding is subtracted, and a 3-digit score
              at 56px doesn't fit even a full-width block that narrow — it was spilling past its own
              card. 34px is small enough to reliably fit "100" with margin (44px still ellipsized at
              the exact boundary in testing); `@lg:text-[56px]` restores the original size once
              there's real room. `flex-wrap` on this row too: the "Capped" badge has no `truncate` (a
              badge word shouldn't ellipsis) and so a non-zero automatic min-width of its own —
              without wrap, a tight row squeezed nearly all its width onto the badge and left the
              score number a sliver (it has `truncate`, so its own automatic min-width is 0 and it
              absorbed the entire shrink first). Wrapping lets "Capped" drop to its own line instead. */}
          <span className={`${mono} text-[34px] @lg:text-[56px] font-extrabold leading-none truncate ${s?.capped ? "text-[#c8321e]" : ""}`}>{s?.headline ?? "—"}</span>
          {s?.capped && <span className="px-2 py-0.5 bg-[#c8321e] text-white text-[11px] font-bold uppercase rounded-sm">Capped</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 flex-1 min-w-0">
        {s?.dimensions.map((d) => <span key={d.name} className={`text-xs px-1.5 py-0.5 border rounded ${d.score < 100 ? "border-[#c8321e] text-[#c8321e]" : "border-[#cfcfcb]"}`}>{label(d.name)} {d.score}</span>)}
      </div>
      <div className="text-xs text-[#6b6b66] w-full @lg:w-72 shrink-0 min-w-0">{run.violations[0]?.message ?? "No Violations."}</div>
    </div>
  );
}

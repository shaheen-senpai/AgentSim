// src/ui/compare/WorldDiffCompare.tsx
// Each Run's already-computed World diff (`run.diff`/`run.unchangedCount`), side by side — the same
// data `DiffPanel.tsx` renders for a single Run, never re-derived here.
import type { RunRecord } from "@/ui/types";
import { heading, mono, panel } from "@/ui/styles";

function Column({ run }: { run: RunRecord }) {
  const diff = run.diff ?? [];
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] font-semibold text-[#6E6B60] mb-1">{run.id.slice(0, 12)}</div>
      {diff.map((d) => (
        <div key={`${d.collection}-${d.entityId}`} className="flex flex-wrap gap-x-2 gap-y-0.5 text-[12px] px-2 py-1 rounded" style={{ background: d.op === "added" ? "#E7F4EA" : "#FDF3DF" }}>
          <span className="w-3 font-bold shrink-0">{d.op === "added" ? "+" : "~"}</span>
          <span className={`${mono} shrink-0`}>{d.entityId}</span>
          {/* `min-w-0` so this shrinks/wraps instead of forcing the row — and the page — wider than
              its column at 400px, the same fix as `RunPicker.tsx`'s selects and `AttackPanel.tsx`'s
              `<dd>`s. */}
          <span className="text-[#6E6B60] min-w-0 break-words">{d.summary}</span>
        </div>
      ))}
      <div className="text-[11px] text-[#6E6B60] px-2 pt-1">{run.unchangedCount ?? 0} entities unchanged</div>
    </div>
  );
}

export function WorldDiffCompare({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  return (
    <section className={`${panel} p-4 flex flex-col gap-3`}>
      <h2 className={`${heading} text-[13px] normal-case tracking-normal font-semibold`}>World diff — what each Run left behind</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Column run={runA} />
        <Column run={runB} />
      </div>
    </section>
  );
}

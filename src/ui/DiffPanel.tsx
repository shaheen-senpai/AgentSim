import type { RunRecord } from "./types";
import { countReadsOutside, readsOutsideLabel } from "./diffSummary";
import { heading, mono, panel } from "./styles";

/**
 * `principalLabel` is the Run's pack's principal entity label ("Customer", "Employee", …), threaded
 * down from the server page the same way `tools` is; `""` when the pack could not be loaded.
 */
export function DiffPanel({ run, principalLabel }: { run: RunRecord | null; principalLabel: string }) {
  const diff = run?.diff ?? [];
  const violatingSeqs = new Set(run?.violations.map((v) => v.eventSeq).filter((s): s is number => s !== null) ?? []);
  const flagged = new Set(run?.events.filter((e) => violatingSeqs.has(e.seq)).flatMap((e) => e.changes.map((c) => c.id)) ?? []);
  const readsOutside = countReadsOutside(run?.violations ?? []);

  return (
    <section className={`${panel} flex-1 overflow-auto`}>
      <div className={`${heading} px-3 py-2.5`}>World diff · start → end</div>
      {!run || run.status === "running" ? (
        <div className="px-3 py-3 text-xs text-[#6b6b66]">{run ? "World is changing…" : "—"}</div>
      ) : (
        <div className="text-[13px]">
          {diff.map((d) => {
            const bad = flagged.has(d.entityId);
            const tone = bad ? "bg-[#fbeeea]" : d.op === "added" ? "bg-[#eef6f0]" : "bg-[#fbf6e8]";
            return (
              <div key={`${d.collection}-${d.entityId}`} className={`flex gap-2.5 px-3 py-1.5 border-t border-[#e6e6e2] ${tone}`}>
                <span className="w-3.5 font-bold">{d.op === "added" ? "+" : "~"}</span>
                <span className={mono}>{d.entityId}</span>
                <span>{d.summary}</span>
                {bad && <span className="ml-auto text-[#6b6b66]">violation</span>}
              </div>
            );
          })}
          <div className="flex gap-2.5 px-3 py-1.5 border-t border-[#e6e6e2] text-[#6b6b66]">
            <span className="w-3.5 font-bold">=</span>
            <span>{run.unchangedCount ?? 0} entities unchanged · {readsOutsideLabel(readsOutside, principalLabel)}</span>
          </div>
        </div>
      )}
    </section>
  );
}

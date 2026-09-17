// src/ui/compare/ChecksTable.tsx
import type { Check } from "@/engine/pack";
import type { Violation } from "@/engine/evaluator";
import { checkOutcomes, groupOutcomesByDimension } from "./compareLedger";
import { heading, mono, panel, successFg } from "@/ui/styles";
import { checkParams } from "@/ui/worlds/packView";

const dangerFgHex = "#B23A22";

export function ChecksTable({ checks, violationsA, violationsB }: { checks: Check[]; violationsA: Violation[]; violationsB: Violation[] }) {
  const groups = groupOutcomesByDimension(checkOutcomes(checks, violationsA, violationsB));
  if (groups.length === 0) return null;

  return (
    <section className={`${panel} overflow-hidden`}>
      <h2 className={`${heading} text-[13px] normal-case tracking-normal font-semibold px-4 pt-4`}>
        Checks — {checks.length}, every one traced to the Mandate
      </h2>
      <div className="grid grid-cols-[1fr_60px_60px] gap-2 px-4 pt-3 pb-1.5 text-[11px] font-semibold text-[#6E6B60] border-b border-[#E3E0D5]">
        <span>Check</span>
        <span className="text-center">A</span>
        <span className="text-center">B</span>
      </div>
      {groups.map((g) => (
        <div key={g.dimension}>
          <div className="px-4 py-1.5 bg-[#F7F5EF] text-[11.5px] font-semibold border-b border-[#E3E0D5]">{g.label}</div>
          {g.outcomes.map((o, i) => (
            <div key={`${g.dimension}-${i}`} className="grid grid-cols-[1fr_60px_60px] gap-2 px-4 py-1.5 items-center border-b border-[#E3E0D5] last:border-b-0 text-[12.5px]">
              <span>
                <span className={`${mono} text-[10.5px] bg-[#F7F5EF] border border-[#E3E0D5] rounded px-1 py-0.5 mr-1.5`}>{o.check.type}</span>
                <span className={`${mono} text-[#6E6B60]`}>{checkParams(o.check)}</span>
              </span>
              <span className="text-center font-bold" style={{ color: o.passA ? successFg : dangerFgHex }}>
                {o.passA ? "✓" : "✗"}
              </span>
              <span className="text-center font-bold" style={{ color: o.passB ? successFg : dangerFgHex }}>
                {o.passB ? "✓" : "✗"}
              </span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

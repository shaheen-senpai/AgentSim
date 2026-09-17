// One card on the Mandates library: a Scenario's Policy, quoted, with the Dimensions its Checks
// score against and a link to the full Scenario. Purely derived — no new data, no persistence.
import Link from "next/link";
import type { Scenario } from "@/engine/pack";
import { serif } from "@/ui/styles";
import { checksByDimension } from "@/ui/worlds/packView";

export function MandateCard({ packId, packName, scenario }: { packId: string; packName: string; scenario: Scenario }) {
  const groups = checksByDimension(scenario.checks);
  return (
    <div className="bg-white border border-[#E3E0D5] rounded-lg p-4.5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className={`${serif} text-[16px] font-semibold`}>{scenario.title}</h2>
        <span className="text-[10.5px] text-[#6E6B60] bg-[#F7F5EF] border border-[#E3E0D5] rounded-full px-2 py-0.5">{packName}</span>
      </div>
      <div className="bg-[#F7F5EF] border border-[#E3E0D5] border-l-[3px] border-l-[#1B1A17] rounded-r-lg px-4 py-3 text-[12.5px] leading-relaxed whitespace-pre-line">
        {scenario.policy.text.trim()}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {groups.map((g) => (
          <span key={g.dimension} className="text-[10.5px] text-[#6E6B60] bg-[#F7F5EF] border border-[#E3E0D5] rounded-full px-2 py-0.5">
            {g.checks.length} × {g.label}
          </span>
        ))}
      </div>
      <Link
        href={`/scenarios/${encodeURIComponent(packId)}/${encodeURIComponent(scenario.id)}`}
        className="text-[12px] font-semibold text-[#1B1A17] underline decoration-dotted self-start"
      >
        View full Scenario →
      </Link>
    </div>
  );
}

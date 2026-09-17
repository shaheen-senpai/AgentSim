// The compact card on the cross-World Scenarios list: title, a one-line Task Brief, and Checks/
// Attacks counts. The full detail (Policy, Checks by Dimension, Attacks with Lure) is one click away
// at the Scenario's own detail route — this card is deliberately not the same content ScenarioCard
// renders, or the list page would just be the World Scenarios tab repeated once per pack.
import Link from "next/link";
import type { Scenario } from "@/engine/pack";
import { serif } from "@/ui/styles";
import { truncate } from "@/ui/worlds/packView";

export function ScenarioListCard({ packId, packName, scenario }: { packId: string; packName: string; scenario: Scenario }) {
  const brief = truncate(scenario.task_brief, 140);
  return (
    <Link
      href={`/scenarios/${encodeURIComponent(packId)}/${encodeURIComponent(scenario.id)}`}
      className="bg-white border border-[#E3E0D5] rounded-lg p-4 flex flex-col gap-2 hover:border-[#1B1A17] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B1A17]"
    >
      <h2 className={`${serif} text-[15px] font-semibold`}>{scenario.title}</h2>
      <p className="text-[12.5px] text-[#6E6B60]" title={brief.truncated ? scenario.task_brief.trim() : undefined}>
        {packName} — {brief.text}
      </p>
      <div className="flex gap-2 mt-1">
        <span className="text-[10.5px] text-[#6E6B60] bg-[#F7F5EF] border border-[#E3E0D5] rounded-full px-2 py-0.5">
          {scenario.checks.length} {scenario.checks.length === 1 ? "Check" : "Checks"}
        </span>
        <span className="text-[10.5px] text-[#6E6B60] bg-[#F7F5EF] border border-[#E3E0D5] rounded-full px-2 py-0.5">
          {scenario.attacks.length} {scenario.attacks.length === 1 ? "Attack" : "Attacks"}
        </span>
      </div>
    </Link>
  );
}

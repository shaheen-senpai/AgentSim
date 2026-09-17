import { loadPacks } from "@/lib/summaries";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { serif } from "@/ui/styles";
import { MandateCard } from "@/ui/scenarios/MandateCard";

export const dynamic = "force-dynamic";

export default function MandatesPage() {
  const { packs } = loadPacks();
  const pairs = packs.flatMap((p) => p.scenarios.map((s) => ({ pack: p, scenario: s })));

  return (
    <ConsoleShell>
      <div className="p-4 flex flex-col gap-4 max-w-[900px]">
        <div className="text-xs text-[#6E6B60]">AgentSim</div>
        <h1 className={`${serif} text-[34px] font-medium tracking-tight`}>Mandates</h1>
        <p className="text-[13px] text-[#6E6B60] max-w-[70ch]">
          The Policy every Scenario carries, surfaced on its own — what every Check traces back to.
        </p>
        {pairs.length === 0 ? (
          <p className="text-[13px] text-[#6E6B60]">No Scenarios found across any installed World.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {pairs.map(({ pack, scenario }) => (
              <MandateCard key={`${pack.meta.id}::${scenario.id}`} packId={pack.meta.id} packName={pack.meta.name} scenario={scenario} />
            ))}
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}

"use client";
import type { WizardPack } from "@/ui/types";
import { panel, focusRing, serif } from "@/ui/styles";
import type { WizardState } from "../NewRunWizard";

export function ScenarioStep({ pack, state, onChange }: { pack: WizardPack; state: WizardState; onChange: (patch: Partial<WizardState>) => void }) {
  return (
    <div className="flex flex-col gap-3 max-w-[720px]">
      {pack.scenarios.map((s) => {
        const selected = state.scenarioId === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange({ scenarioId: s.id, attackId: "off" })}
            className={`${panel} p-4.5 text-left ${focusRing} ${selected ? "shadow-[0_0_0_1px_#1B1A17_inset] border-[#1B1A17]" : ""}`}
          >
            <h3 className={`${serif} text-[15px] font-semibold mb-1.5`}>{s.title}</h3>
            <p className="text-[12.5px] text-[#6E6B60]">{s.taskBrief}</p>
          </button>
        );
      })}
    </div>
  );
}

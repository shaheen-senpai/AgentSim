"use client";
import type { WizardScenario } from "@/ui/types";
import { panel } from "@/ui/styles";

export function MandateStep({ scenario }: { scenario: WizardScenario }) {
  return (
    <div className={`${panel} p-5 max-w-[720px] flex flex-col gap-3`}>
      <h2 className="text-[14px] font-semibold">The Mandate — what the agent is authorised to do</h2>
      <div className="bg-[#F7F5EF] border border-[#E3E0D5] border-l-[3px] border-l-[#1B1A17] rounded-r-lg px-4.5 py-4 text-[13.5px] leading-relaxed whitespace-pre-line">
        {scenario.policyText}
      </div>
      <p className="text-[11.5px] text-[#6E6B60] flex items-center gap-1.5">
        ↳ drawn from the Scenario you picked — &ldquo;{scenario.title}&rdquo;. Every Check on Review traces back to a sentence here.
      </p>
    </div>
  );
}

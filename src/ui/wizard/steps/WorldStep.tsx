"use client";
import Link from "next/link";
import type { WizardPack } from "@/ui/types";
import { panel, focusRing } from "@/ui/styles";
import type { WizardState } from "../NewRunWizard";

export function WorldStep({ packs, state, onChange }: { packs: WizardPack[]; state: WizardState; onChange: (patch: Partial<WizardState>) => void }) {
  if (packs.length === 0) {
    return (
      <div className={`${panel} p-6 text-center flex flex-col gap-2`}>
        <p className="text-[13px] text-[#6E6B60]">No Worlds installed yet.</p>
        <Link href="/worlds/new" className={`${focusRing} text-[13px] font-semibold text-[#1B1A17] underline underline-offset-2`}>
          Create a World →
        </Link>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
      {packs.map((p) => {
        const selected = state.packId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange({ packId: p.id, scenarioId: p.scenarios[0]?.id ?? "", attackId: "off", agentVersion: p.agentVersions[0] ?? "" })}
            className={`${panel} p-4 text-left ${focusRing} ${selected ? "shadow-[0_0_0_1px_#1B1A17_inset] border-[#1B1A17]" : ""}`}
          >
            <h3 className="text-[15px] font-semibold mb-1">{p.name}</h3>
            <div className="font-mono text-[11px] text-[#6E6B60] mb-2">{p.domain}</div>
            <p className="text-[12.5px] text-[#6E6B60] mb-2.5 leading-relaxed">{p.description}</p>
            <div className="flex gap-3.5 flex-wrap text-[11px] text-[#6E6B60]">
              <span>{p.entities} entities</span>
              <span>Principal: {p.principal}</span>
              <span>{p.systems} systems</span>
              <span>{p.tools.length} tools</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

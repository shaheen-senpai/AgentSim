"use client";
import type { WizardAttack, WizardScenario } from "@/ui/types";
import { panel, focusRing, dangerFg } from "@/ui/styles";
import type { WizardState } from "../NewRunWizard";

export function formatLure(lure: WizardAttack["lure"]): string {
  const entries = Object.entries(lure.argsMatch);
  if (entries.length === 1) return `${lure.tool} → ${String(entries[0][1])}`;
  return `${lure.tool} → ${entries.map(([k, v]) => `${k}: ${String(v)}`).join(", ")}`;
}

export function AttackStep({ scenario, state, onChange }: { scenario: WizardScenario; state: WizardState; onChange: (patch: Partial<WizardState>) => void }) {
  return (
    <div className="flex flex-col gap-2.5 max-w-[720px]">
      <button
        type="button"
        onClick={() => onChange({ attackId: "off" })}
        className={`${panel} p-4 text-left ${focusRing} ${state.attackId === "off" ? "shadow-[0_0_0_1px_#1E7A43_inset] border-[#1E7A43]" : ""}`}
      >
        <h3 className="text-[13.5px] font-semibold mb-1">Off — clean run</h3>
        <p className="text-[12px] text-[#6E6B60]">The World stays exactly as seeded. No planted text, no Lure.</p>
      </button>
      {scenario.attacks.map((a) => {
        const selected = state.attackId === a.id;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onChange({ attackId: a.id })}
            className={`${panel} p-4 text-left ${focusRing} ${selected ? "shadow-[0_0_0_1px_#1B1A17_inset] border-[#1B1A17]" : ""}`}
          >
            <h3 className="text-[13.5px] font-semibold mb-1">{a.id}</h3>
            <p className="text-[12px] text-[#6E6B60]">{a.title}</p>
            <div className="mt-2 font-mono text-[11px]" style={{ color: dangerFg }}>
              ⚡ Lure — {formatLure(a.lure)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

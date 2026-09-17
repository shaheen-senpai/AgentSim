"use client";
import type { WizardAttack, WizardScenario } from "@/ui/types";
import type { WizardState } from "../NewRunWizard";

/** "issue_refund → pay_7001", or every matched argument when there are several. */
export function formatLure(lure: WizardAttack["lure"]): string {
  const entries = Object.entries(lure.argsMatch);
  if (entries.length === 1) return `${lure.tool} → ${String(entries[0][1])}`;
  return `${lure.tool} → ${entries.map(([k, v]) => `${k}: ${String(v)}`).join(", ")}`;
}

export function AttackStep({ scenario, state, onChange }: { scenario: WizardScenario; state: WizardState; onChange: (patch: Partial<WizardState>) => void }) {
  return (
    <div className="step-grid single">
      <button type="button" className={`attack-card off${state.attackId === "off" ? " selected" : ""}`} aria-pressed={state.attackId === "off"} style={{ width: "100%", display: "block" }} onClick={() => onChange({ attackId: "off" })}>
        <h3>Off — clean run</h3>
        <p>The World stays exactly as seeded. No planted text, no Lure.</p>
      </button>
      {scenario.attacks.map((a) => (
        <button key={a.id} type="button" className={`attack-card${state.attackId === a.id ? " selected" : ""}`} aria-pressed={state.attackId === a.id} style={{ width: "100%", display: "block" }} onClick={() => onChange({ attackId: a.id })}>
          <h3>{a.id}</h3>
          <p>{a.title}</p>
          <div className="lure-tag">⚡ Lure — {formatLure(a.lure)}</div>
        </button>
      ))}
    </div>
  );
}

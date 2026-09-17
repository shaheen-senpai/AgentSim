"use client";
import type { WizardPack } from "@/ui/types";
import type { WizardState } from "../NewRunWizard";

export function ScenarioStep({ pack, state, onChange }: { pack: WizardPack; state: WizardState; onChange: (patch: Partial<WizardState>) => void }) {
  return (
    <div className="step-grid single">
      {pack.scenarios.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`scenario-card${state.scenarioId === s.id ? " selected" : ""}`}
          aria-pressed={state.scenarioId === s.id}
          style={{ width: "100%", display: "block" }}
          onClick={() => onChange({ scenarioId: s.id, attackId: "off" })}
        >
          <h3>{s.title}</h3>
          <p className="brief">{s.taskBrief}</p>
        </button>
      ))}
      {pack.scenarios.length === 0 && <p className="sub">This World has no Scenarios yet — add one on its Scenarios tab.</p>}
    </div>
  );
}

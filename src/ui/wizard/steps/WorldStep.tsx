"use client";
import Link from "next/link";
import type { WizardPack } from "@/ui/types";
import type { WizardState } from "../NewRunWizard";

export function WorldStep({ packs, state, onChange }: { packs: WizardPack[]; state: WizardState; onChange: (patch: Partial<WizardState>) => void }) {
  if (packs.length === 0) {
    return (
      <div className="step-grid single">
        <div className="panel card-pad" style={{ textAlign: "center" }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>No Worlds installed yet.</p>
          <Link href="/worlds/new" className="linkish" style={{ fontFamily: "var(--sans)", fontSize: 13 }}>Create a World →</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="step-grid single">
      <div className="world-grid">
        {packs.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`world-card${state.packId === p.id ? " selected" : ""}`}
            aria-pressed={state.packId === p.id}
            style={{ width: "100%" }}
            onClick={() => onChange({ packId: p.id, scenarioId: p.scenarios[0]?.id ?? "", attackId: "off" })}
          >
            <h3>{p.name}</h3>
            <div className="domain">{p.domain}</div>
            <p>{p.description}</p>
            <div className="meta-row">
              <span>{p.entities} entities</span>
              <span>Principal: {p.principalLabel}</span>
              <span>{p.scenarios.length} Scenario{p.scenarios.length === 1 ? "" : "s"}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

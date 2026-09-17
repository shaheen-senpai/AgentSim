"use client";
import Link from "next/link";
import type { WizardPack } from "@/ui/types";
import type { WizardState } from "../NewRunWizard";

export function WorldStep({ packs, state, onChange, inReview }: { packs: WizardPack[]; state: WizardState; onChange: (patch: Partial<WizardState>) => void; inReview: number }) {
  const reviewNote = inReview > 0 && (
    <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "12px 0 0" }}>
      {inReview} World{inReview === 1 ? " is" : "s are"} still in review, so {inReview === 1 ? "it is" : "they are"} not offered here —{" "}
      <Link href="/worlds" className="linkish" style={{ fontFamily: "var(--sans)", fontSize: 11.5 }}>publish {inReview === 1 ? "it" : "them"} first</Link>.
    </p>
  );
  if (packs.length === 0) {
    return (
      <div className="step-grid single">
        <div className="panel card-pad" style={{ textAlign: "center" }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>{inReview > 0 ? "No published Worlds yet." : "No Worlds installed yet."}</p>
          <Link href={inReview > 0 ? "/worlds" : "/worlds/new"} className="linkish" style={{ fontFamily: "var(--sans)", fontSize: 13 }}>
            {inReview > 0 ? "Review the drafts →" : "Create a World →"}
          </Link>
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
      {reviewNote}
    </div>
  );
}

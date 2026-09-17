"use client";
import type { WizardScenario } from "@/ui/types";

export function MandateStep({ scenario }: { scenario: WizardScenario }) {
  return (
    <div className="step-grid single">
      <div className="panel card-pad">
        <h2>The Mandate — what the agent is authorised to do</h2>
        <div className="mandate-quote" style={{ whiteSpace: "pre-line" }}>{scenario.policyText.trim()}</div>
        <div className="derive-note">↳ drawn from the Scenario you picked — “{scenario.title}”. Every Check in Review traces back to a sentence here.</div>
      </div>
    </div>
  );
}

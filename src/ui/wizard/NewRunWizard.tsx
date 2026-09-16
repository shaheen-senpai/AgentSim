"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Agent, WizardPack } from "@/ui/types";
import { StepStrip } from "./StepStrip";
import { ConnectStep } from "./steps/ConnectStep";
import { WorldStep } from "./steps/WorldStep";
import { ScenarioStep } from "./steps/ScenarioStep";
import { MandateStep } from "./steps/MandateStep";
import { AttackStep } from "./steps/AttackStep";
import { secondaryButton, primaryButton, serif, hint } from "@/ui/styles";

export const STEP_LABELS = ["Connect agent", "World", "Scenario", "Mandate", "Attacks", "Review"];
export type ConnectMode = "reference" | "mcp" | "forwarder" | "connector";
export type WizardState = {
  step: number;
  connect: ConnectMode;
  agentVersion: string;
  existingAgentId: string | null;
  packId: string;
  scenarioId: string;
  attackId: string;
};

function initialState(packs: WizardPack[]): WizardState {
  const pack = packs[0];
  return {
    step: 0,
    connect: "reference",
    agentVersion: pack?.agentVersions[0] ?? "",
    existingAgentId: null,
    packId: pack?.id ?? "",
    scenarioId: pack?.scenarios[0]?.id ?? "",
    attackId: "off",
  };
}

export function NewRunWizard({ packs, agents: initialAgents }: { packs: WizardPack[]; agents: Agent[] }) {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(() => initialState(packs));
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<WizardState>) {
    setState((s) => ({ ...s, ...patch }));
  }

  const pack = packs.find((p) => p.id === state.packId);
  const scenario = pack?.scenarios.find((s) => s.id === state.scenarioId);
  const lastStep = STEP_LABELS.length - 1;

  const canContinue = state.step === 0 ? state.connect === "reference" || state.existingAgentId !== null : state.step === 1 ? packs.length > 0 : true;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-[980px]">
      <div className="text-xs text-[#6E6B60]">
        Runs / <b className="text-[#1B1A17]">New run</b>
      </div>
      <h1 className={`${serif} text-[34px] font-medium tracking-tight`}>New run</h1>
      <p className="text-[13px] text-[#6E6B60] max-w-[70ch]">Connect an agent, pick a World and a Scenario, choose whether to attack it, then review.</p>

      <StepStrip labels={STEP_LABELS} current={state.step} onSelect={(step) => step <= state.step && update({ step })} />

      {state.step === 0 && (
        <ConnectStep state={state} pack={pack} agents={agents} onChange={update} onAgentRegistered={(a) => setAgents((prev) => [...prev, a])} />
      )}
      {state.step === 1 && <WorldStep packs={packs} state={state} onChange={update} />}
      {state.step === 2 && pack && <ScenarioStep pack={pack} state={state} onChange={update} />}
      {state.step === 3 && scenario && <MandateStep scenario={scenario} />}
      {state.step === 4 && scenario && <AttackStep scenario={scenario} state={state} onChange={update} />}
      {state.step === 5 && <p className={hint}>Review step — added by Task 5.</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => update({ step: Math.max(0, state.step - 1) })}
          className={secondaryButton}
          style={{ visibility: state.step === 0 ? "hidden" : "visible" }}
        >
          ← Back
        </button>
        <div className="flex gap-3 ml-auto">
          <button type="button" onClick={() => router.push("/")} className={secondaryButton}>
            Cancel
          </button>
          {state.step < lastStep && (
            <button type="button" disabled={!canContinue} onClick={() => update({ step: state.step + 1 })} className={primaryButton}>
              Continue →
            </button>
          )}
        </div>
      </div>
      {busy || error ? null : null}
    </div>
  );
}

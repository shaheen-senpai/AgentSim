"use client";
// The New run wizard (design/agentsim-console.html 607-623, state machine 2247-2422). Six steps;
// "▷ Start Run" on the last one creates the Run and redirects to its page.
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Agent, WizardPack } from "@/ui/types";
import { StepStrip } from "./StepStrip";
import { ConnectStep, mcpAgents } from "./steps/ConnectStep";
import { WorldStep } from "./steps/WorldStep";
import { ScenarioStep } from "./steps/ScenarioStep";
import { MandateStep } from "./steps/MandateStep";
import { AttackStep } from "./steps/AttackStep";
import { ReviewStep } from "./steps/ReviewStep";

export const STEP_LABELS = ["Connect agent", "World", "Scenario", "Mandate", "Attacks", "Review"];
export type WizardState = {
  step: number;
  /** The registered MCP agent that will connect — the only way into a Run. */
  existingAgentId: string | null;
  packId: string;
  scenarioId: string;
  attackId: string;
};

// The `/runs/new?packId=…&scenarioId=…` deep link the World pages hand out (`runHref` in
// `src/ui/worlds/packView.ts`). A `packId` that matches no pack, or a `scenarioId` outside the
// resolved pack, is never trusted — the first pack and its first Scenario are the fallback.
function initialState(packs: WizardPack[], agents: Agent[], searchParams: URLSearchParams): WizardState {
  const packIdParam = searchParams.get("packId");
  const pack = (packIdParam ? packs.find((p) => p.id === packIdParam) : undefined) ?? packs[0];
  const scenarioIdParam = searchParams.get("scenarioId");
  const scenario = scenarioIdParam ? pack?.scenarios.find((s) => s.id === scenarioIdParam) : undefined;
  return {
    step: 0,
    existingAgentId: mcpAgents(agents)[0]?.id ?? null,
    packId: pack?.id ?? "",
    scenarioId: scenario?.id ?? pack?.scenarios[0]?.id ?? "",
    attackId: "off",
  };
}

export function NewRunWizard({ packs, agents: initialAgents }: { packs: WizardPack[]; agents: Agent[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<WizardState>(() => initialState(packs, initialAgents, searchParams));
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<WizardState>) {
    setState((s) => ({ ...s, ...patch }));
  }

  const pack = packs.find((p) => p.id === state.packId);
  const scenario = pack?.scenarios.find((s) => s.id === state.scenarioId);
  const lastStep = STEP_LABELS.length - 1;
  const canContinue = state.step === 0 ? state.existingAgentId !== null : state.step === 1 ? packs.length > 0 : true;

  async function startRun() {
    const agentId = state.existingAgentId;
    if (!pack || !scenario || !agentId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packId: pack.id, scenarioId: scenario.id, agent: { kind: "byo", agentId }, attackId: state.attackId === "off" ? null : state.attackId }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? `The Run was not created (HTTP ${res.status}).`);
        return;
      }
      router.push(`/runs/${data.id}`);
    } catch {
      setError("Network error — no Run was created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="view-wizard">
      <div className="crumb">
        Runs / <b>New run</b>
      </div>
      <h1 className="page serif">New run</h1>
      <p className="sub">Connect an agent, pick a World and a Scenario, choose whether to attack it, then review.</p>

      <StepStrip labels={STEP_LABELS} current={state.step} onSelect={(step) => step <= state.step && update({ step })} />

      <div id="stepBody">
        {state.step === 0 && <ConnectStep state={state} pack={pack} agents={agents} onChange={update} onAgentRegistered={(a) => setAgents((prev) => [...prev, a])} />}
        {state.step === 1 && <WorldStep packs={packs} state={state} onChange={update} />}
        {state.step === 2 && pack && <ScenarioStep pack={pack} state={state} onChange={update} />}
        {state.step === 3 && scenario && <MandateStep scenario={scenario} />}
        {state.step === 4 && scenario && <AttackStep scenario={scenario} state={state} onChange={update} />}
        {state.step === 5 && pack && scenario && <ReviewStep state={state} pack={pack} scenario={scenario} agents={agents} busy={busy} error={error} onStart={startRun} />}
      </div>

      <div className="footer-actions">
        <button type="button" className="btn btn-ghost" onClick={() => update({ step: Math.max(0, state.step - 1) })} style={{ visibility: state.step === 0 ? "hidden" : "visible" }}>
          ← Back
        </button>
        <div className="right">
          <button type="button" className="btn btn-ghost" onClick={() => router.push("/runs")}>Cancel</button>
          {state.step < lastStep && (
            <button type="button" className="btn btn-primary" disabled={!canContinue} onClick={() => update({ step: state.step + 1 })}>
              Continue →
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

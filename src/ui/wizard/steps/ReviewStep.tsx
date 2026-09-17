"use client";
import type { Agent, WizardPack, WizardScenario } from "@/ui/types";
import { formatLure } from "./AttackStep";
import type { WizardState } from "../NewRunWizard";

const CONNECT_LABELS: Record<WizardState["connect"], string> = {
  reference: "Reference Agent",
  mcp: "MCP server",
  forwarder: "Forwarder",
  connector: "Anthropic Connector",
};

export function ReviewStep({ state, pack, scenario, agents, busy, error, onStart }: { state: WizardState; pack: WizardPack; scenario: WizardScenario; agents: Agent[]; busy: boolean; error: string | null; onStart: () => void }) {
  const agentLabel =
    state.connect === "reference"
      ? `${CONNECT_LABELS.reference} · ${state.agentVersion === "naive" ? "naïve" : state.agentVersion}`
      : `${CONNECT_LABELS[state.connect]} · ${agents.find((a) => a.id === state.existingAgentId)?.name ?? "—"}`;
  const attack = scenario.attacks.find((a) => a.id === state.attackId);
  const attackLabel = state.attackId === "off" ? "Off — clean run" : attack ? `${attack.id} (${formatLure(attack.lure)})` : state.attackId;

  return (
    <div className="step-grid single">
      <div className="panel card-pad">
        <h2>Review</h2>
        <dl className="review-grid">
          <dt>Agent</dt>
          <dd>{agentLabel}</dd>
          <dt>World</dt>
          <dd>
            {pack.name} <span className="mono" style={{ color: "var(--muted)" }}>({pack.domain})</span>
          </dd>
          <dt>Scenario</dt>
          <dd>{scenario.title}</dd>
          <dt>Mandate</dt>
          <dd style={{ color: "var(--muted)", fontSize: 12.5 }}>{scenario.policyText.trim().split("\n")[0]} …</dd>
          <dt>Attack</dt>
          <dd>{attackLabel}</dd>
        </dl>
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
          <button type="button" className="btn btn-primary" onClick={onStart} disabled={busy} style={{ width: "100%", justifyContent: "center", height: 46, fontSize: 14 }}>
            {busy ? "Starting…" : "▷ Start Run"}
          </button>
          {error && (
            <div className="nw-note" style={{ borderLeftColor: "var(--danger-fg)", color: "var(--danger-fg)", marginTop: 12, marginBottom: 0 }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

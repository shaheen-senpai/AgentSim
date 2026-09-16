"use client";
import type { Agent, WizardPack, WizardScenario } from "@/ui/types";
import { panel, primaryButton, dangerBg, dangerFg } from "@/ui/styles";
import { formatLure } from "./AttackStep";
import type { WizardState } from "../NewRunWizard";

const CONNECT_LABELS: Record<WizardState["connect"], string> = {
  reference: "Reference Agent",
  mcp: "MCP server",
  forwarder: "Forwarder",
  connector: "Anthropic Connector",
};

export function ReviewStep({
  state,
  pack,
  scenario,
  agents,
  busy,
  error,
  onStart,
}: {
  state: WizardState;
  pack: WizardPack;
  scenario: WizardScenario;
  agents: Agent[];
  busy: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const agentLabel =
    state.connect === "reference"
      ? `${CONNECT_LABELS.reference} · ${state.agentVersion}`
      : `${CONNECT_LABELS[state.connect]} · ${agents.find((a) => a.id === state.existingAgentId)?.name ?? "—"}`;
  const attack = scenario.attacks.find((a) => a.id === state.attackId);
  const attackLabel = state.attackId === "off" ? "Off — clean run" : attack ? `${attack.id} (${formatLure(attack.lure)})` : state.attackId;

  return (
    <div className={`${panel} p-5 max-w-[720px] flex flex-col gap-4`}>
      <h2 className="text-[14px] font-semibold">Review</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-[13px]">
        <dt className="text-[11px] uppercase tracking-wide text-[#6E6B60] pt-0.5">Agent</dt>
        <dd>{agentLabel}</dd>
        <dt className="text-[11px] uppercase tracking-wide text-[#6E6B60] pt-0.5">World</dt>
        <dd>
          {pack.name} <span className="font-mono text-[#6E6B60]">({pack.domain})</span>
        </dd>
        <dt className="text-[11px] uppercase tracking-wide text-[#6E6B60] pt-0.5">Scenario</dt>
        <dd>{scenario.title}</dd>
        <dt className="text-[11px] uppercase tracking-wide text-[#6E6B60] pt-0.5">Mandate</dt>
        <dd className="text-[12.5px] text-[#6E6B60]">{scenario.policyText.split("\n")[0]} …</dd>
        <dt className="text-[11px] uppercase tracking-wide text-[#6E6B60] pt-0.5">Attack</dt>
        <dd>{attackLabel}</dd>
      </dl>
      <div className="pt-4 border-t border-[#E3E0D5] flex flex-col gap-2">
        <button type="button" onClick={onStart} disabled={busy} className={`${primaryButton} w-full justify-center h-[46px] text-[14px]`}>
          {busy ? "Starting…" : "▷ Start Run"}
        </button>
        {error && (
          <p className="text-[12px] rounded px-2.5 py-1.5" style={{ background: dangerBg, color: dangerFg }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

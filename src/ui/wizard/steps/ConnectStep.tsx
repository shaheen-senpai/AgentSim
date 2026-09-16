"use client";
import { useState } from "react";
import type { Agent, WizardPack } from "@/ui/types";
import { panel, focusRing, field, label as labelClass, hint } from "@/ui/styles";
import { RegisterAgent, type AgentSubmission } from "@/ui/connect/RegisterAgent";
import { mcpAddCommand, forwarderTs, forwarderPy, connectorBlock } from "@/ui/connect/snippets";
import type { ConnectMode, WizardState } from "../NewRunWizard";

const PLACEHOLDER_MCP_URL = "http://localhost:3000/mcp/runs/:id";
const PLACEHOLDER_CALL_URL = "http://localhost:3000/api/runs/:id/call";

const CONNECT_OPTS: { id: ConnectMode; label: string; desc: string }[] = [
  { id: "reference", label: "Reference Agent", desc: "AgentSim's own agent runs this Scenario for you — naïve or fixed system prompt. No connection needed." },
  { id: "mcp", label: "MCP server", desc: "AgentSim is an MCP server. Point your agent at one URL." },
  { id: "forwarder", label: "Forwarder", desc: "Drop one function into your own tool-execution loop — 30 lines, TS or Python." },
  { id: "connector", label: "Anthropic Connector", desc: "Built directly on the Messages API? Point mcp_servers at us — no client code at all." },
];

/** The registered agents that can serve a given Connect mode — a Reference Run needs none at all. */
export function matchingAgents(agents: Agent[], connect: ConnectMode): Agent[] {
  return connect === "reference" ? [] : agents.filter((a) => a.shape === connect);
}

export function ConnectStep({
  state,
  pack,
  agents,
  onChange,
  onAgentRegistered,
}: {
  state: WizardState;
  pack: WizardPack | undefined;
  agents: Agent[];
  onChange: (patch: Partial<WizardState>) => void;
  /** Called with the newly-saved Agent right after registration, so the parent can add it to its
   * list without a refetch — `agents` here is a snapshot, not live, so without this the agent just
   * registered would not be found by `matchingAgents`/`selectedAgent` until the page reloads. */
  onAgentRegistered: (agent: Agent) => void;
}) {
  const [fwLang, setFwLang] = useState<"ts" | "py">("ts");
  const matching = matchingAgents(agents, state.connect);
  const [registering, setRegistering] = useState(matching.length === 0);
  const selectedAgent = agents.find((a) => a.id === state.existingAgentId) ?? null;

  function selectConnect(mode: ConnectMode) {
    const nextMatching = matchingAgents(agents, mode);
    setRegistering(mode !== "reference" && nextMatching.length === 0);
    onChange({ connect: mode, existingAgentId: mode === "reference" ? null : (nextMatching[0]?.id ?? null) });
  }

  async function register(submission: AgentSubmission): Promise<string | null> {
    try {
      const res = await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(submission) });
      const data = (await res.json().catch(() => ({}))) as Partial<Agent> & { error?: string };
      if (!res.ok || !data.id) return data.error ?? `The agent was not saved (HTTP ${res.status}).`;
      // `POST /api/agents` responds with the full saved Agent (`saveAgent`'s return value) on
      // success, not just an id — so `data` is a complete `Agent` here, safe to hand to
      // `onAgentRegistered`.
      const saved = data as Agent;
      onChange({ existingAgentId: saved.id });
      onAgentRegistered(saved);
      setRegistering(false);
      return null;
    } catch {
      return "Network error — the agent was not saved.";
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
      <div className={`${panel} p-4.5 flex flex-col gap-1`}>
        <h2 className="text-[14px] font-semibold mb-2">How the agent reaches this Run</h2>
        {CONNECT_OPTS.map((o) => (
          <label
            key={o.id}
            className={`flex items-start gap-3 p-3.5 border rounded-lg mb-1 cursor-pointer ${o.id === state.connect ? "border-[#1B1A17] shadow-[0_0_0_1px_#1B1A17_inset]" : "border-[#E3E0D5]"}`}
          >
            <input type="radio" name="connect" checked={o.id === state.connect} onChange={() => selectConnect(o.id)} className="mt-0.5 accent-[#1B1A17]" />
            <div className="flex-1">
              <div className="font-semibold text-[13.5px]">{o.label}</div>
              <div className="text-[12px] text-[#6E6B60] mt-0.5 leading-relaxed">{o.desc}</div>
            </div>
          </label>
        ))}
      </div>

      <div className={`${panel} p-4.5 flex flex-col gap-3`}>
        {state.connect === "reference" ? (
          <>
            <h2 className="text-[14px] font-semibold">Agent and tool definitions</h2>
            <div className="flex gap-2">
              {(pack?.agentVersions ?? []).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange({ agentVersion: v })}
                  className={`h-8 px-3.5 rounded-full text-[12px] border ${focusRing} ${state.agentVersion === v ? "bg-[#1B1A17] text-white border-[#1B1A17]" : "border-[#E3E0D5]"}`}
                >
                  {v === "naive" ? "naïve" : v}
                </button>
              ))}
            </div>
            <p className={hint}>
              {state.agentVersion === "fixed"
                ? "The same tools, the same model — corrected to treat record content as data, not instructions."
                : "Deliberately weak: treats internal-looking notes inside records as pre-approved instructions."}
            </p>
            {pack && (
              <div className="overflow-x-auto">
                <p className={hint}>Tools for {pack.name} — pick a different World on the next step if needed.</p>
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-[#6E6B60]">
                      <th className="pb-1.5">Tool</th>
                      <th className="pb-1.5">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pack.tools.map((t) => (
                      <tr key={t.name} className="border-t border-[#E3E0D5]">
                        <td className="py-1.5 pr-2 font-mono text-[11.5px]">{t.name}</td>
                        <td className="py-1.5 text-[#6E6B60]">{t.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="text-[14px] font-semibold">Connect, then map your tools</h2>
            {matching.length > 0 && !registering && (
              <div className="flex flex-col gap-1">
                <label htmlFor="wizard-agent-select" className={labelClass}>
                  Agent
                </label>
                <select
                  id="wizard-agent-select"
                  value={state.existingAgentId ?? ""}
                  onChange={(e) => onChange({ existingAgentId: e.target.value })}
                  className={field}
                >
                  {matching.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.version}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setRegistering(true)} className="self-start text-[12px] underline underline-offset-2 text-[#1B1A17]">
                  + Register a new agent
                </button>
              </div>
            )}
            {registering && (
              <div className="flex flex-col gap-2">
                {matching.length > 0 && (
                  <button type="button" onClick={() => setRegistering(false)} className="self-start text-[12px] underline underline-offset-2 text-[#1B1A17]">
                    ← Cancel, pick an existing agent instead
                  </button>
                )}
                <RegisterAgent
                  editing={null}
                  lockedShape={state.connect}
                  onSubmit={register}
                  onCancel={() => setRegistering(false)}
                />
              </div>
            )}
            {!registering && selectedAgent && (
              <>
                {state.connect === "mcp" && (
                  <pre className="bg-[#F7F5EF] border border-[#E3E0D5] rounded-lg p-3 text-[11.5px] font-mono overflow-x-auto whitespace-pre">
                    {mcpAddCommand(selectedAgent.name, PLACEHOLDER_MCP_URL)}
                  </pre>
                )}
                {state.connect === "forwarder" && (
                  <>
                    <div className="flex gap-2">
                      {(["ts", "py"] as const).map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setFwLang(l)}
                          className={`h-7 px-3 rounded text-[12px] border ${focusRing} ${fwLang === l ? "bg-[#1B1A17] text-white border-[#1B1A17]" : "border-[#E3E0D5]"}`}
                        >
                          {l === "ts" ? "TypeScript" : "Python"}
                        </button>
                      ))}
                    </div>
                    <pre className="bg-[#F7F5EF] border border-[#E3E0D5] rounded-lg p-3 text-[11.5px] font-mono overflow-x-auto whitespace-pre">
                      {fwLang === "ts" ? forwarderTs(PLACEHOLDER_CALL_URL) : forwarderPy(PLACEHOLDER_CALL_URL)}
                    </pre>
                  </>
                )}
                {state.connect === "connector" && (
                  <pre className="bg-[#F7F5EF] border border-[#E3E0D5] rounded-lg p-3 text-[11.5px] font-mono overflow-x-auto whitespace-pre">
                    {connectorBlock(PLACEHOLDER_MCP_URL)}
                  </pre>
                )}
                {pack && (
                  <div className="overflow-x-auto">
                    <p className={hint}>Tool aliases for {pack.name} — pick a different World on the next step if needed.</p>
                    <table className="w-full text-[12px] border-collapse">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-[#6E6B60]">
                          <th className="pb-1.5">Your tool</th>
                          <th className="pb-1.5">AgentSim tool</th>
                          <th className="pb-1.5">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pack.tools.map((t) => {
                          const theirs = Object.entries(selectedAgent.toolAliases).find(([, ours]) => ours === t.name)?.[0];
                          return (
                            <tr key={t.name} className="border-t border-[#E3E0D5]">
                              <td className="py-1.5 pr-2 font-mono text-[11.5px]">{theirs ?? t.name}</td>
                              <td className="py-1.5 pr-2 font-mono text-[11.5px] text-[#6E6B60]">{t.name}</td>
                              <td className="py-1.5">
                                <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${theirs ? "bg-[#E7F4EA] text-[#1E7A43]" : "bg-[#E3E0D5] text-[#6E6B60]"}`}>
                                  {theirs ? "mapped" : "auto"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

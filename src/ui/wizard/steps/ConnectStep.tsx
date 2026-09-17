"use client";
// Step 1 (design/agentsim-console.html, `state.step === 0`): the one way an agent reaches a Run —
// AgentSim as an MCP server — with the registered agent that will connect, the snippet it needs,
// and how its tool names map onto this World's.
import { useState, type CSSProperties } from "react";
import type { Agent, WizardPack } from "@/ui/types";
import { RegisterAgent, type AgentSubmission } from "@/ui/connect/RegisterAgent";
import { mcpAddCommand, mcpJsonConfig } from "@/ui/connect/snippets";
import type { WizardState } from "../NewRunWizard";

// The Run does not exist yet, so the snippets carry the mock's `:id` placeholder; the Run page
// shows the same snippets with the real URLs once the Run is created.
const PLACEHOLDER_MCP_URL = "http://localhost:3000/mcp/runs/:id/:source";

const PRE: CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontSize: 11.5, lineHeight: 1.6, overflowX: "auto", margin: "0 0 16px", whiteSpace: "pre" };

/**
 * The registered agents this step can start a Run for: the ones that reach us over MCP, and the
 * "driven" ones we reach ourselves. The older forwarder and connector shapes are not offered.
 */
export function mcpAgents(agents: Agent[]): Agent[] {
  return agents.filter((a) => a.shape === "mcp" || a.shape === "driven");
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
  /** Called with the newly saved Agent so the parent can add it to its list without a refetch. */
  onAgentRegistered: (agent: Agent) => void;
}) {
  const matching = mcpAgents(agents);
  const [registering, setRegistering] = useState(matching.length === 0);
  const selectedAgent = agents.find((a) => a.id === state.existingAgentId) ?? null;

  async function register(submission: AgentSubmission): Promise<string | null> {
    try {
      const res = await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(submission) });
      const data = (await res.json().catch(() => ({}))) as Partial<Agent> & { error?: string };
      if (!res.ok || !data.id) return data.error ?? `The agent was not saved (HTTP ${res.status}).`;
      const saved = data as Agent; // POST /api/agents answers with the whole saved Agent
      onChange({ existingAgentId: saved.id });
      onAgentRegistered(saved);
      setRegistering(false);
      return null;
    } catch {
      return "Network error — the agent was not saved.";
    }
  }

  const tools = pack?.tools ?? [];

  return (
    <div className="step-grid">
      <div className="panel card-pad">
        <h2>How the agent reaches this Run</h2>
        <label className="option selected">
          <input type="radio" name="connect" checked readOnly />
          <div style={{ flex: 1 }}>
            <div className="label">MCP server</div>
            <div className="desc">AgentSim is an MCP server. Point your agent at one URL per source.</div>
          </div>
        </label>
      </div>

      <div className="panel card-pad">
        <h2>Connect, then map your tools</h2>
        {matching.length > 0 && !registering && (
          <div className="form-row">
            <label htmlFor="wizard-agent-select">Agent</label>
            <select id="wizard-agent-select" value={state.existingAgentId ?? ""} onChange={(e) => onChange({ existingAgentId: e.target.value })}>
              {matching.map((a) => (
                <option key={a.id} value={a.id}>{a.name} · {a.version}</option>
              ))}
            </select>
            <button type="button" className="linkish" style={{ fontFamily: "var(--sans)", fontSize: 11, marginTop: 8 }} onClick={() => setRegistering(true)}>+ Register a new agent</button>
          </div>
        )}
        {registering && (
          <div style={{ marginBottom: 16 }}>
            {matching.length > 0 && (
              <button type="button" className="linkish" style={{ fontFamily: "var(--sans)", fontSize: 11, marginBottom: 10 }} onClick={() => setRegistering(false)}>← Cancel, pick an existing agent instead</button>
            )}
            <RegisterAgent editing={null} onSubmit={register} onCancel={() => setRegistering(false)} />
          </div>
        )}
        {!registering && selectedAgent?.shape === "driven" && (
          <p className="hint">
            Nothing to paste: AgentSim calls this agent itself, at <span className="mono">{selectedAgent.url}</span>, and
            records what it says. Tool calls are not routed through the World yet, so the Run will have no Events to
            score.
          </p>
        )}
        {!registering && selectedAgent && selectedAgent.shape !== "driven" && (
          <>
            <span className="field-label">Claude Code</span>
            <pre className="mono" style={PRE}>{mcpAddCommand(selectedAgent.name, PLACEHOLDER_MCP_URL)}</pre>
            <span className="field-label">Or, any MCP client</span>
            <pre className="mono" style={PRE}>{mcpJsonConfig(selectedAgent.name, PLACEHOLDER_MCP_URL)}</pre>
            <span className="field-label">Your tools, mapped onto this World&rsquo;s</span>
            <table className="tooltable">
              <thead>
                <tr><th>Your tool</th><th>AgentSim tool</th><th>Status</th></tr>
              </thead>
              <tbody>
                {tools.map((t) => {
                  const theirs = Object.entries(selectedAgent.toolAliases).find(([, ours]) => ours === t.name)?.[0];
                  return (
                    <tr key={t.name}>
                      <td className="t-name">{theirs ?? t.name}</td>
                      <td className="t-name" style={{ color: "var(--muted)" }}>{t.name}</td>
                      <td><span className={`pill-badge ${theirs ? "badge-success" : "badge-neutral"}`}>{theirs ? "mapped" : "auto"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ fontSize: 11, color: "var(--muted)", margin: "10px 0 0" }}>Same name on both sides maps itself. Rename the ones that don&rsquo;t when you register the agent.</p>
          </>
        )}
      </div>
    </div>
  );
}

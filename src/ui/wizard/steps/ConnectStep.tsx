"use client";
// Step 1 (design/agentsim-console.html 2294-2344): how the agent reaches the Run, and — for a
// registered agent — the snippet it needs and how its tool names map onto this World's.
import { useState, type CSSProperties } from "react";
import type { Agent, WizardPack } from "@/ui/types";
import { RegisterAgent, type AgentSubmission } from "@/ui/connect/RegisterAgent";
import { connectorBlock, forwarderPy, forwarderTs, mcpAddCommand, mcpJsonConfig } from "@/ui/connect/snippets";
import type { ConnectMode, WizardState } from "../NewRunWizard";

// The Run does not exist yet, so the snippets carry the mock's `:id` placeholder; the Run page
// shows the same snippets with the real URLs once the Run is created.
const PLACEHOLDER_MCP_URL = "http://localhost:3000/mcp/runs/:id/:source";
const PLACEHOLDER_CALL_URL = "http://localhost:3000/api/runs/:id/call";

const PRE: CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontSize: 11.5, lineHeight: 1.6, overflowX: "auto", margin: "0 0 16px", whiteSpace: "pre" };

const CONNECT_OPTS: { id: ConnectMode; label: string; tag: string | null; desc: string }[] = [
  { id: "reference", label: "Reference Agent", tag: null, desc: "AgentSim's own agent runs this Scenario for you — naïve or fixed system prompt. No connection needed." },
  { id: "mcp", label: "MCP server", tag: null, desc: "AgentSim is an MCP server. Point your agent at one URL per source." },
  { id: "forwarder", label: "Forwarder", tag: null, desc: "Drop one function into your own tool-execution loop — 30 lines, TS or Python." },
  { id: "connector", label: "Anthropic Connector", tag: "needs a public URL", desc: "Built directly on the Messages API? Point mcp_servers at us — no client code at all." },
];

/** The registered agents that can serve a given Connect mode — a Reference Run needs none at all. */
export function matchingAgents(agents: Agent[], connect: ConnectMode): Agent[] {
  return connect === "reference" ? [] : agents.filter((a) => a.shape === connect);
}

const versionLabel = (v: string) => (v === "naive" ? "naïve" : v);

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
  const [fwLang, setFwLang] = useState<"ts" | "py">("ts");
  const matching = matchingAgents(agents, state.connect);
  const [registering, setRegistering] = useState(matching.length === 0);
  const selectedAgent = agents.find((a) => a.id === state.existingAgentId) ?? null;

  function selectConnect(mode: ConnectMode) {
    const next = matchingAgents(agents, mode);
    setRegistering(mode !== "reference" && next.length === 0);
    onChange({ connect: mode, existingAgentId: mode === "reference" ? null : (next[0]?.id ?? null) });
  }

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
        {CONNECT_OPTS.map((o) => (
          <label key={o.id} className={`option${state.connect === o.id ? " selected" : ""}`}>
            <input type="radio" name="connect" checked={state.connect === o.id} onChange={() => selectConnect(o.id)} />
            <div style={{ flex: 1 }}>
              <div className="label">
                {o.label}
                {o.tag && <span className="roadmap-tag">{o.tag}</span>}
              </div>
              <div className="desc">{o.desc}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="panel card-pad">
        <h2>{state.connect === "reference" ? "Agent and tool definitions" : "Connect, then map your tools"}</h2>

        {state.connect === "reference" ? (
          <>
            <span className="field-label">Prompt</span>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {(pack?.agentVersions ?? []).map((v) => (
                <button key={v} type="button" className="btn btn-ghost" style={{ height: 32, padding: "0 14px", fontSize: 12 }} aria-pressed={state.agentVersion === v} onClick={() => onChange({ agentVersion: v })}>
                  {state.agentVersion === v ? <b>{versionLabel(v)}</b> : versionLabel(v)}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 16px" }}>
              {state.agentVersion === "fixed"
                ? "The same tools, the same model — corrected to treat record content as data, not instructions."
                : state.agentVersion === "naive"
                  ? "Deliberately weak: treats internal-looking notes inside records as pre-approved instructions."
                  : "The pack's own Reference Agent prompt."}
            </p>
            <span className="field-label">Tools this World exposes</span>
            <table className="tooltable">
              <thead>
                <tr><th>Tool</th><th>Maps to</th><th>Status</th></tr>
              </thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.name}>
                    <td className="t-name">{t.name}</td>
                    <td className="t-name" style={{ color: "var(--muted)" }}>{t.op} {t.collection}</td>
                    <td><span className="pill-badge badge-success">ready</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
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
                <RegisterAgent editing={null} lockedShape={state.connect} onSubmit={register} onCancel={() => setRegistering(false)} />
              </div>
            )}
            {!registering && selectedAgent && (
              <>
                {state.connect === "mcp" && (
                  <>
                    <span className="field-label">Claude Code</span>
                    <pre className="mono" style={PRE}>{mcpAddCommand(selectedAgent.name, PLACEHOLDER_MCP_URL)}</pre>
                    <span className="field-label">Or, any MCP client</span>
                    <pre className="mono" style={PRE}>{mcpJsonConfig(selectedAgent.name, PLACEHOLDER_MCP_URL)}</pre>
                  </>
                )}
                {state.connect === "forwarder" && (
                  <>
                    <span className="field-label">Language</span>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      {(["ts", "py"] as const).map((l) => (
                        <button key={l} type="button" className="btn btn-ghost" style={{ height: 30, padding: "0 12px", fontSize: 12 }} aria-pressed={fwLang === l} onClick={() => setFwLang(l)}>
                          {fwLang === l ? <b>{l === "ts" ? "TypeScript" : "Python"}</b> : l === "ts" ? "TypeScript" : "Python"}
                        </button>
                      ))}
                    </div>
                    <pre className="mono" style={PRE}>{fwLang === "ts" ? forwarderTs(PLACEHOLDER_CALL_URL) : forwarderPy(PLACEHOLDER_CALL_URL)}</pre>
                  </>
                )}
                {state.connect === "connector" && (
                  <>
                    <span className="field-label">Messages API request</span>
                    <pre className="mono" style={PRE}>{connectorBlock(PLACEHOLDER_MCP_URL)}</pre>
                    <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "0 0 16px" }}>Needs a publicly reachable URL — a tunnel in front of this machine, not localhost.</p>
                  </>
                )}
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
          </>
        )}
      </div>
    </div>
  );
}

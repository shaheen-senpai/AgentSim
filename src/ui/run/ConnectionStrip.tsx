"use client";
// Shown above a BYO Run's flow while it is running: the URLs its agent should point at (one MCP
// endpoint per System, or the forwarder endpoint), the Task Brief, the idle countdown and the
// Finish button. Every URL is derived from this page's own origin, so a tunnel, a LAN address and
// localhost each hand out a link that resolves for whoever is reading.
import { useEffect, useState, type CSSProperties } from "react";
import type { RunRecord } from "@/ui/types";
import { CopyButton } from "@/ui/connect/CopyButton";
import { connectorBlock, curlTools, forwarderPy, forwarderTs, mcpAddCommand, serverName, toolsUrl } from "@/ui/connect/snippets";
import { idleLabel } from "@/ui/idle";
import { useOrigin } from "@/ui/useOrigin";

const PRE: CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontSize: 11.5, lineHeight: 1.6, overflowX: "auto", margin: "0 0 16px", whiteSpace: "pre" };
const NOTE: CSSProperties = { fontSize: 11.5, color: "var(--muted)", margin: "0 0 16px" };

export function ConnectionStrip({ run, systems, onFinished }: { run: RunRecord; systems: string[]; onFinished: (finished: RunRecord) => void }) {
  const origin = useOrigin();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const [lang, setLang] = useState<"ts" | "py">("ts");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shape = run.agent.kind === "byo" ? run.agent.shape : "mcp";
  const name = run.agent.kind === "byo" ? run.agent.name : "agentsim";
  const idle = idleLabel(run, now);
  const mcpUrls = origin ? systems.map((system) => ({ system, url: `${origin}/mcp/runs/${run.id}/${system}` })) : [];
  const callUrl = origin ? `${origin}/api/runs/${run.id}/call` : "";
  const mcpJson = JSON.stringify({ mcpServers: Object.fromEntries(mcpUrls.map(({ system, url }) => [`${serverName(name)}-${system}`, { type: "http", url }])) }, null, 2);

  async function finish() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${run.id}/finish`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as RunRecord & { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Finish failed (HTTP ${res.status}).`);
        return;
      }
      onFinished(data);
    } catch {
      setError("Network error — the Run was not finished.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="panel card-pad" style={{ marginBottom: 16 }}>
      <h2>
        Waiting for your agent · {run.events.length} event{run.events.length === 1 ? "" : "s"}
        {idle ? ` · idle ${idle}` : ""}
      </h2>

      {!origin ? null : shape === "mcp" ? (
        <>
          <span className="field-label">Claude Code — one server per source</span>
          {mcpUrls.map(({ system, url }) => (
            <div key={system} className="copyfield" style={{ marginBottom: 8 }}>
              <code>{mcpAddCommand(`${name} ${system}`, url)}</code>
              <CopyButton text={mcpAddCommand(`${name} ${system}`, url)} what="Command" />
            </div>
          ))}
          <span className="field-label" style={{ marginTop: 14 }}>Or, any MCP client</span>
          <pre className="mono" style={PRE}>{mcpJson}</pre>
          <p style={NOTE}>The Task Brief also arrives as each server&rsquo;s <span className="mono">instructions</span>, so an MCP agent needs nothing else pasted.</p>
        </>
      ) : shape === "forwarder" ? (
        <>
          <span className="field-label">Language</span>
          <div className="seg" style={{ marginBottom: 10 }}>
            <button type="button" className={lang === "ts" ? "active" : ""} onClick={() => setLang("ts")}>TypeScript</button>
            <button type="button" className={lang === "py" ? "active" : ""} onClick={() => setLang("py")}>Python</button>
          </div>
          <pre className="mono" style={PRE}>{lang === "py" ? forwarderPy(callUrl) : forwarderTs(callUrl)}</pre>
          <span className="field-label">What this Run publishes</span>
          <div className="copyfield" style={{ marginBottom: 16 }}>
            <code>{curlTools(toolsUrl(callUrl))}</code>
            <CopyButton text={curlTools(toolsUrl(callUrl))} what="Command" />
          </div>
        </>
      ) : shape === "driven" ? (
        <p style={NOTE}>
          Nothing to paste: AgentSim calls this agent itself, at the endpoint registered for it, and sends it this
          Run&rsquo;s id. Its tool calls become Events here as it makes them against{" "}
          <span className="mono">POST /api/runs/:id/call</span>; a Run that ends with none means the agent executed
          against its own world instead.
        </p>
      ) : (
        <>
          <span className="field-label">Messages API request</span>
          <pre className="mono" style={PRE}>{connectorBlock(mcpUrls[0]?.url ?? "")}</pre>
          <p style={NOTE}>Needs a publicly reachable URL — a tunnel in front of this machine, not localhost — and <span className="mono">AGENTSIM_ALLOWED_HOSTS</span> naming that host.</p>
        </>
      )}

      <span className="field-label">Task Brief</span>
      <div className="copyfield" style={{ marginBottom: 16 }}>
        <code style={{ whiteSpace: "pre-wrap" }}>{run.taskBrief}</code>
        <CopyButton text={run.taskBrief} what="Task Brief" />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" onClick={finish} disabled={pending}>
          {pending ? "Finishing…" : "Finish & evaluate"}
        </button>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Ends the Run now and scores what the agent did. It also finishes itself when the idle timer runs out.</span>
      </div>
      {error && (
        <div className="nw-note" style={{ borderLeftColor: "var(--danger-fg)", color: "var(--danger-fg)", marginTop: 12, marginBottom: 0 }}>
          {error}
        </div>
      )}
    </div>
  );
}

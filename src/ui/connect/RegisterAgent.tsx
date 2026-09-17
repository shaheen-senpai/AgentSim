"use client";
// Register — or edit — one agent, in the mock's form vocabulary. `draftErrors` says what is
// obviously wrong before a round trip; `POST /api/agents` (Zod) stays the authority.
import { useId, useState, type FormEvent } from "react";
import type { Agent, AgentShape } from "@/ui/types";
import { draftErrors, formatAliases, parseAliases } from "./aliases";

export type AgentSubmission = { name: string; version: string; shape: AgentShape; toolAliases: Record<string, string>; url: string; authHeaderEnv: string; notes: string };

// Two ways in, and only two. MCP is the agent reaching us; "driven" is us reaching the agent, for a
// deployment that cannot have its tool URLs repointed. `AgentShape` still carries the forwarder and
// connector shapes recorded against older agents and Runs, but neither is offered here any more.
const SHAPES: { value: AgentShape; label: string; blurb: string }[] = [
  { value: "mcp", label: "MCP", blurb: "Its tools come from MCP servers — point one at the Run's URL." },
  { value: "driven", label: "Driven", blurb: "AgentSim calls it — give the URL of an endpoint that takes the Task Brief and answers." },
];

type Props = {
  editing: Agent | null;
  /** Resolves to an error message, or null when the agent was saved. */
  onSubmit: (submission: AgentSubmission) => Promise<string | null>;
  onCancel: () => void;
};

export function RegisterAgent({ editing, onSubmit, onCancel }: Props) {
  const ids = useId();
  const [name, setName] = useState(editing?.name ?? "");
  const [version, setVersion] = useState(editing?.version ?? "");
  const [shape, setShape] = useState<AgentShape>(editing?.shape === "driven" ? "driven" : "mcp");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [authHeaderEnv, setAuthHeaderEnv] = useState(editing?.authHeaderEnv ?? "");
  const [aliasText, setAliasText] = useState(formatAliases(editing?.toolAliases ?? {}));
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const local = draftErrors({ name, version, aliasText });
    // The only field the other shape does not have: without it there is nothing to call.
    if (shape === "driven" && url.trim() === "") local.push("A driven agent needs the URL AgentSim should call.");
    if (local.length > 0) {
      setErrors(local);
      return;
    }
    setErrors([]);
    setPending(true);
    try {
      const failure = await onSubmit({
        name: name.trim(),
        version: version.trim(),
        shape,
        toolAliases: parseAliases(aliasText).aliases,
        url: shape === "driven" ? url.trim() : "",
        authHeaderEnv: shape === "driven" ? authHeaderEnv.trim() : "",
        notes: notes.trim(),
      });
      if (failure) {
        setErrors([failure]);
        return;
      }
      if (!editing) {
        setName("");
        setVersion("");
        setAliasText("");
        setUrl("");
        setAuthHeaderEnv("");
        setNotes("");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-labelledby={`${ids}-heading`}>
      <span id={`${ids}-heading`} className="field-label">{editing ? `Edit ${editing.name}` : "Register agent"}</span>
      <div className="step-grid" style={{ gap: 12 }}>
        <div className="form-row">
          <label htmlFor={`${ids}-name`}>Name</label>
          <input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Triage Bot" />
        </div>
        <div className="form-row">
          <label htmlFor={`${ids}-version`}>Version</label>
          <input id={`${ids}-version`} className="mono" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2026.09.1" spellCheck={false} />
        </div>
      </div>

      <div className="form-row">
        <label>Shape</label>
        <div className="seg">
          {SHAPES.map((s) => (
            <button key={s.value} type="button" className={shape === s.value ? "active" : ""} aria-pressed={shape === s.value} onClick={() => setShape(s.value)}>
              {s.label}
            </button>
          ))}
        </div>
        <p className="hint" style={{ margin: "6px 0 0" }}>{SHAPES.find((s) => s.value === shape)?.blurb}</p>
      </div>

      {shape === "driven" && (
        <>
          <div className="form-row">
            <label htmlFor={`${ids}-url`}>Endpoint URL</label>
            <input id={`${ids}-url`} className="mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:4000/agentsim" spellCheck={false} aria-describedby={`${ids}-url-hint`} />
            <p id={`${ids}-url-hint`} className="hint" style={{ margin: "6px 0 0" }}>
              AgentSim POSTs <span className="mono">{"{ runId, taskBrief, messages }"}</span> here and expects{" "}
              <span className="mono">{"{ reply }"}</span> back. Hosts other than this machine must be named in AGENTSIM_ALLOWED_AGENT_HOSTS.
            </p>
          </div>
          <div className="form-row">
            <label htmlFor={`${ids}-auth`}>Auth header variable</label>
            <input id={`${ids}-auth`} className="mono" value={authHeaderEnv} onChange={(e) => setAuthHeaderEnv(e.target.value)} placeholder="ACME_AGENT_TOKEN" spellCheck={false} aria-describedby={`${ids}-auth-hint`} />
            <p id={`${ids}-auth-hint`} className="hint" style={{ margin: "6px 0 0" }}>
              Optional. The NAME of an environment variable on this server holding the Authorization header. The name is
              stored, never the secret.
            </p>
          </div>
        </>
      )}

      <div className="form-row">
        <label htmlFor={`${ids}-aliases`}>Tool aliases</label>
        <textarea id={`${ids}-aliases`} className="mono" value={aliasText} onChange={(e) => setAliasText(e.target.value)} rows={4} spellCheck={false} placeholder={"fetch_ticket: get_ticket\nmail_customer: send_email"} aria-describedby={`${ids}-aliases-hint`} style={{ fontSize: 12 }} />
        <p id={`${ids}-aliases-hint`} className="hint" style={{ margin: "6px 0 0" }}>
          One <span className="mono">their_name: our_tool</span> per line. Your agent keeps calling the tools it already knows; we publish ours under those names over MCP. Leave it empty if the names already match.
        </p>
      </div>

      <div className="form-row">
        <label htmlFor={`${ids}-notes`}>Notes</label>
        <input id={`${ids}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Claude Code, internal prompt v7" />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="submit" className="btn btn-primary" style={{ height: 32, fontSize: 12 }} disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Register agent"}
        </button>
        {editing && (
          <button type="button" className="btn btn-ghost" style={{ height: 32, fontSize: 12 }} onClick={onCancel}>Cancel</button>
        )}
      </div>

      <div role="status" aria-live="polite">
        {errors.length > 0 && (
          <ul className="nw-note" style={{ borderLeftColor: "var(--danger-fg)", color: "var(--danger-fg)", margin: "12px 0 0", paddingLeft: 28 }}>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}

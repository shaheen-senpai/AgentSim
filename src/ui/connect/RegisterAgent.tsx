"use client";
// Register — or edit — one agent, in the mock's form vocabulary. `draftErrors` says what is
// obviously wrong before a round trip; `POST /api/agents` (Zod) stays the authority.
import { useId, useState, type FormEvent } from "react";
import type { Agent, AgentShape } from "@/ui/types";
import { draftErrors, formatAliases, parseAliases } from "./aliases";

export type AgentSubmission = { name: string; version: string; shape: AgentShape; toolAliases: Record<string, string>; notes: string };

const SHAPES: { value: AgentShape; label: string; blurb: string }[] = [
  { value: "mcp", label: "MCP", blurb: "Its tools come from MCP servers — point one at the Run's URL." },
  { value: "forwarder", label: "Forwarder", blurb: "It runs its own loop — forward each tool call to the Run." },
  { value: "connector", label: "Connector", blurb: "It is built on the Anthropic Messages API — pass the Run as an MCP server." },
];

type Props = {
  editing: Agent | null;
  lockedShape?: AgentShape;
  /** Resolves to an error message, or null when the agent was saved. */
  onSubmit: (submission: AgentSubmission) => Promise<string | null>;
  onCancel: () => void;
};

export function RegisterAgent({ editing, lockedShape, onSubmit, onCancel }: Props) {
  const ids = useId();
  const [name, setName] = useState(editing?.name ?? "");
  const [version, setVersion] = useState(editing?.version ?? "");
  const [shape, setShape] = useState<AgentShape>(editing?.shape ?? lockedShape ?? "mcp");
  const [aliasText, setAliasText] = useState(formatAliases(editing?.toolAliases ?? {}));
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const local = draftErrors({ name, version, aliasText });
    if (local.length > 0) {
      setErrors(local);
      return;
    }
    setErrors([]);
    setPending(true);
    try {
      const failure = await onSubmit({ name: name.trim(), version: version.trim(), shape, toolAliases: parseAliases(aliasText).aliases, notes: notes.trim() });
      if (failure) {
        setErrors([failure]);
        return;
      }
      if (!editing) {
        setName("");
        setVersion("");
        setAliasText("");
        setNotes("");
      }
    } finally {
      setPending(false);
    }
  }

  const current = SHAPES.find((s) => s.value === shape);

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

      {lockedShape === undefined ? (
        <div className="form-row">
          <label>Shape</label>
          <div className="seg">
            {SHAPES.map((s) => (
              <button key={s.value} type="button" className={shape === s.value ? "active" : ""} aria-pressed={shape === s.value} onClick={() => setShape(s.value)}>
                {s.label}
              </button>
            ))}
          </div>
          <p className="hint" style={{ margin: "6px 0 0" }}>{current?.blurb}</p>
        </div>
      ) : (
        <p className="hint">
          Shape: <b style={{ color: "var(--ink)" }}>{current?.label}</b> — {current?.blurb}
        </p>
      )}

      <div className="form-row">
        <label htmlFor={`${ids}-aliases`}>Tool aliases</label>
        <textarea id={`${ids}-aliases`} className="mono" value={aliasText} onChange={(e) => setAliasText(e.target.value)} rows={4} spellCheck={false} placeholder={"fetch_ticket: get_ticket\nmail_customer: send_email"} aria-describedby={`${ids}-aliases-hint`} style={{ fontSize: 12 }} />
        <p id={`${ids}-aliases-hint`} className="hint" style={{ margin: "6px 0 0" }}>
          One <span className="mono">their_name: our_tool</span> per line. Your agent keeps calling the tools it already knows; we publish ours under those names over MCP and accept them on the forwarder. Leave it empty if the names already match.
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

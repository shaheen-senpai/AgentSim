"use client";
// Register — or edit — one agent (spec §6.3). The form is the same either way; the parent remounts
// it with a `key` when the agent being edited changes, so the fields always start from that agent.
//
// Validation here is a courtesy, not a gate: `draftErrors` says what is obviously wrong before a
// round trip, and `POST /api/agents` (Zod, `AgentInputSchema`) remains the authority on what is
// accepted. Anything the API rejects is shown verbatim.
import { useId, useState, type FormEvent } from "react";
import type { Agent, AgentShape } from "@/ui/types";
import { field, heading, hint, label, mono, panel, primaryButton, secondaryButton } from "@/ui/styles";
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
  /**
   * Resolves to an error message, or null when the agent was saved. Success is announced by the
   * parent, not here: saving an edit clears `editing`, which changes this form's `key` and
   * remounts it, so any confirmation held in local state would be thrown away before it was read.
   */
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
      const failure = await onSubmit({
        name: name.trim(),
        version: version.trim(),
        shape,
        toolAliases: parseAliases(aliasText).aliases,
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
        setNotes("");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`${panel} p-3 flex flex-col gap-3`} aria-labelledby={`${ids}-heading`}>
      <h2 id={`${ids}-heading`} className={heading}>
        {editing ? `Edit ${editing.name}` : "Register agent"}
      </h2>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-name`} className={label}>
            Name
          </label>
          <input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Triage Bot" className={field} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-version`} className={label}>
            Version
          </label>
          <input
            id={`${ids}-version`}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="2026.09.1"
            spellCheck={false}
            className={`${field} ${mono}`}
          />
        </div>
      </div>

      {lockedShape === undefined ? (
        <fieldset className="flex flex-col gap-1 border-0 p-0 m-0">
          <legend className={label}>Shape</legend>
          <div className="flex gap-1">
            {SHAPES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setShape(s.value)}
                aria-pressed={shape === s.value}
                className={`h-7 flex-1 rounded px-2 text-[12px] border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b] ${
                  shape === s.value ? "bg-[#1d1d1b] text-white border-[#1d1d1b] font-semibold" : "bg-white text-[#6b6b66] border-[#cfcfcb] hover:text-[#1d1d1b]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className={hint}>{SHAPES.find((s) => s.value === shape)?.blurb}</p>
        </fieldset>
      ) : (
        <p className={hint}>
          Shape: <span className="font-semibold text-[#1d1d1b]">{SHAPES.find((s) => s.value === lockedShape)?.label}</span> —{" "}
          {SHAPES.find((s) => s.value === lockedShape)?.blurb}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${ids}-aliases`} className={label}>
          Tool aliases
        </label>
        <textarea
          id={`${ids}-aliases`}
          value={aliasText}
          onChange={(e) => setAliasText(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder={"fetch_ticket: get_ticket\nmail_customer: send_email"}
          aria-describedby={`${ids}-aliases-hint`}
          className={`${field} ${mono} text-[12px]`}
        />
        <p id={`${ids}-aliases-hint`} className={hint}>
          One <span className={mono}>their_name: our_tool</span> per line. Your agent keeps calling the tools it already knows; we publish ours
          under those names over MCP and accept them on the forwarder. Leave it empty if the names already match.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${ids}-notes`} className={label}>
          Notes
        </label>
        <input
          id={`${ids}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Claude Code, internal prompt v7"
          className={field}
        />
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : editing ? "Save changes" : "Register agent"}
        </button>
        {editing && (
          <button type="button" onClick={onCancel} className={secondaryButton}>
            Cancel
          </button>
        )}
      </div>

      <div role="status" aria-live="polite" className="text-[12px] empty:hidden">
        {errors.length > 0 && (
          <ul className="flex flex-col gap-0.5 border border-[#c8321e] bg-[#fbeeea] rounded p-2">
            {errors.map((e, i) => (
              <li key={i} className="text-[11px] text-[#c8321e]">
                {e}
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}

"use client";
// The mock's inline `edit` → textarea → Save/Cancel (design/agentsim-console.html `editable`
// 1618-1632), used for a Scenario's Task Brief and Mandate on two tabs.
import { useState } from "react";

/** YAML block prose carries hard wraps at ~90 columns; on screen a single newline is a space, a blank line a paragraph. */
const flow = (text: string) => text.replace(/([^\n])\n(?!\n)/g, "$1 ");

export function EditableText({ label, value, quote = false, rows = 3, onSave }: { label: string; value: string; quote?: boolean; rows?: number; onSave: (next: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);

  if (editing) {
    return (
      <div className="form-row" style={{ margin: 0 }}>
        <label>{label}</label>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} style={{ minHeight: rows * 26, fontSize: 12.5 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ height: 32, fontSize: 12 }}
            disabled={pending}
            onClick={async () => {
              setPending(true);
              const ok = await onSave(draft.trim());
              setPending(false);
              if (ok) setEditing(false);
            }}
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn btn-ghost" style={{ height: 32, fontSize: 12 }} onClick={() => { setDraft(value); setEditing(false); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
        <span className="field-label" style={{ margin: 0 }}>{label}</span>
        <button type="button" className="linkish" style={{ fontFamily: "var(--sans)", fontSize: 11, fontWeight: 600 }} onClick={() => { setDraft(value); setEditing(true); }}>edit</button>
      </div>
      {quote ? <div className="mandate-quote" style={{ fontSize: 12.5, whiteSpace: "pre-line" }}>{flow(value)}</div> : <p style={{ fontSize: 13, margin: 0, whiteSpace: "pre-line" }}>{flow(value)}</p>}
    </>
  );
}

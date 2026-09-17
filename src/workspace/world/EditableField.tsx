"use client";
// Inline "edit → textarea → Save/Cancel" for one prose field, workspace theme. The console's
// `EditableText` does the same job in its own shell.
import { useState } from "react";
import { Button } from "@/marketing/Button";
import { eyebrow, input } from "../ui";

/** YAML block prose carries hard wraps at ~90 columns; on screen a single newline is a space, a blank line a paragraph. */
export const flow = (text: string) => text.replace(/([^\n])\n(?!\n)/g, "$1 ");

export function EditableField({ id, label, value, quote = false, rows = 3, onSave }: { id: string; label: string; value: string; quote?: boolean; rows?: number; onSave: (next: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);

  return (
    <div>
      <div className="flex items-baseline gap-3">
        <label htmlFor={id} className={eyebrow}>{label}</label>
        {!editing && (
          <button type="button" onClick={() => { setDraft(value); setEditing(true); }} className="cursor-pointer font-label text-[11px] uppercase text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-2">
          <textarea id={id} value={draft} onChange={(e) => setDraft(e.target.value)} rows={rows} className={`${input} resize-y ${quote ? "font-label text-caption" : ""}`} autoFocus />
          <div className="mt-2 flex gap-2">
            <Button className="min-h-9 text-caption" disabled={pending || draft.trim() === ""} onClick={async () => { setPending(true); const ok = await onSave(draft.trim()); setPending(false); if (ok) setEditing(false); }}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" className="min-h-9 text-caption" disabled={pending} onClick={() => { setDraft(value); setEditing(false); }}>Cancel</Button>
          </div>
        </div>
      ) : quote ? (
        <blockquote id={id} className="mt-2 whitespace-pre-line rounded-panel border border-border border-l-2 border-l-primary bg-background px-4 py-3 font-label text-body leading-relaxed">{flow(value)}</blockquote>
      ) : (
        <p id={id} className="mt-2 whitespace-pre-line text-body">{flow(value)}</p>
      )}
    </div>
  );
}

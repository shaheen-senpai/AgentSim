"use client";
// The World's own Mandates — captured from the agent's real policy by the worldbuilder plugin —
// each editable in place. A Scenario cites a Mandate rather than copying it, so editing one here
// moves every Scenario that cites it. Same edit as the console's Mandate tab, workspace theme.
import { useState } from "react";
import { Button } from "@/marketing/Button";
import { setMandateText } from "@/ui/worlds/packEdits";
import { useSavePack } from "@/ui/worlds/useSavePack";
import { eyebrow, input, tag } from "../ui";
import type { WorldDetailView } from "../worldDetail";
import { SaveNote } from "./SaveNote";

type Mandate = WorldDetailView["mandates"][number];

/** YAML block prose carries hard wraps at ~90 columns; on screen a single newline is a space, a blank line a paragraph. */
const flow = (text: string) => text.replace(/([^\n])\n(?!\n)/g, "$1 ");

function MandateItem({ mandate, onSave, pending }: { mandate: Mandate; onSave: (text: string) => Promise<boolean>; pending: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(mandate.text);
  return (
    <li className="rounded-panel border border-border border-l-2 border-l-primary bg-background px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-body font-semibold">{mandate.label}</h3>
        <span className={tag}>{mandate.id}</span>
        {!editing && (
          <button type="button" onClick={() => { setDraft(mandate.text); setEditing(true); }} className="ml-auto cursor-pointer font-label text-[11px] uppercase text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-3">
          <label className={eyebrow} htmlFor={`mandate-${mandate.id}`}>Mandate text</label>
          <textarea id={`mandate-${mandate.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className={`${input} mt-1.5 resize-y font-label text-caption`} />
          <div className="mt-3 flex gap-2">
            <Button className="min-h-9 text-caption" disabled={pending || draft.trim() === ""} onClick={async () => { if (await onSave(draft.trim())) setEditing(false); }}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" className="min-h-9 text-caption" disabled={pending} onClick={() => { setDraft(mandate.text); setEditing(false); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-line font-label text-body leading-relaxed">“{flow(mandate.text)}”</p>
      )}
      <p className="mt-2 text-caption text-muted-foreground">Cited by {mandate.citedBy.length > 0 ? mandate.citedBy.join(" · ") : "no Scenario yet"}</p>
    </li>
  );
}

export function MandateList({ worldId, files, mandates }: { worldId: string; files: Record<string, string>; mandates: Mandate[] }) {
  const { save, pending, errors } = useSavePack(worldId);
  return (
    <>
      <ul className="mt-4 flex flex-col gap-3">
        {mandates.map((m) => (
          <MandateItem key={m.id} mandate={m} pending={pending} onSave={(text) => save({ ...files, "pack.yaml": setMandateText(files["pack.yaml"] ?? "", m.id, text) })} />
        ))}
      </ul>
      <SaveNote errors={errors} />
    </>
  );
}

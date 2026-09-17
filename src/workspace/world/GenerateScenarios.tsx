"use client";
// "Generate Scenarios & seed data": stage two of building a World. The structure came from the
// agent's own repo; what it is tested with is written here, and read before it is saved.
//
// `POST /api/worlds/:id/scenarios` writes nothing — the proposal lives in this component until the
// reviewer saves it through the same PUT every other edit uses. The console's island
// (`src/ui/worlds/GenerateScenarios.tsx`) has the same contract; this is the workspace-themed one.
import { useEffect, useState } from "react";
import type { ValidationError } from "@/engine/pack";
import { Button } from "@/marketing/Button";
import { Icon } from "@/marketing/icons";
import { proposalChanges } from "@/ui/worlds/GenerateScenarios";
import { useSavePack } from "@/ui/worlds/useSavePack";
import { eyebrow, input, tag } from "../ui";
import { FailureNote, SaveNote } from "./SaveNote";

type Proposal = { files: Record<string, string>; errors: ValidationError[] };

export function GenerateScenarios({ worldId, files }: { worldId: string; files: Record<string, string> }) {
  const { save, pending, errors } = useSavePack(worldId);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);

  // A generation is a long Opus call; the button alone would look hung for minutes.
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [busy]);

  async function generate() {
    setElapsed(0);
    setBusy(true);
    setFailure(null);
    setProposal(null);
    try {
      const res = await fetch(`/api/worlds/${worldId}/scenarios`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Proposal> & { error?: string };
      if (!res.ok || !data.files) {
        setFailure(data.error ?? `Nothing was generated (HTTP ${res.status}).`);
        return;
      }
      setProposal({ files: data.files, errors: data.errors ?? [] });
    } catch {
      setFailure("Network error — nothing was generated.");
    } finally {
      setBusy(false);
    }
  }

  const changes = proposal ? proposalChanges(files, proposal.files) : null;

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-4 rounded-panel border border-border bg-background px-5 py-4">
        <div className="min-w-[220px] flex-1">
          <p className="font-heading text-body font-semibold">Generate Scenarios &amp; seed data</p>
          <p className="mt-1 text-caption text-muted-foreground">
            Claude writes the Task Brief, the Checks, the Attacks and the rows they need — from this World&apos;s own structure and Mandates. Nothing is saved until you have read it.
          </p>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional — what should it test?" aria-label="What the Scenarios should test" className={`${input} min-w-[200px] flex-1 sm:max-w-xs`} disabled={busy} />
        <Button className="min-h-10 text-caption" disabled={busy || pending} onClick={() => void generate()}>
          {busy ? <><Icon name="spinner" className="size-4 animate-spin" /> Generating… {elapsed}s</> : <><Icon name="play" className="size-4" /> Generate</>}
        </Button>
      </div>

      <FailureNote message={failure} />

      {proposal && changes && (
        <section className="animate-reveal mt-4 rounded-panel border border-primary/40 bg-background p-5" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-heading text-h3 font-semibold">
              Proposed — {changes.added.length === 0 ? "no new Scenario" : `${changes.added.length} new Scenario${changes.added.length === 1 ? "" : "s"}`}
            </h3>
            <span className={tag}>nothing saved yet</span>
          </div>
          <p className="mt-2 text-caption text-muted-foreground">
            {changes.seedChanged ? "The Seed was rewritten to carry the rows these Scenarios name. " : "The Seed is unchanged. "}
            Read the Checks against the Mandate they claim to grade: a Check that binds the wrong row passes for the wrong reason.
          </p>

          <SaveNote errors={proposal.errors} title="This proposal does not validate" />

          <div className="mt-4 flex flex-col gap-4">
            {changes.added.map((id) => (
              <div key={id}>
                <p className={eyebrow}>scenarios/{id}.yaml</p>
                <pre className="mt-1.5 max-h-[420px] overflow-auto rounded-control border border-border bg-surface p-4 font-label text-[11.5px] leading-relaxed text-foreground">{proposal.files[`scenarios/${id}.yaml`]}</pre>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button className="min-h-10 text-caption" disabled={pending || proposal.errors.length > 0} onClick={async () => { if (await save(proposal.files)) setProposal(null); }}>
              {pending ? "Saving…" : "Save to this World"}
            </Button>
            <Button variant="ghost" className="min-h-10 text-caption" disabled={pending} onClick={() => setProposal(null)}>Discard proposal</Button>
          </div>
          <SaveNote errors={errors} />
        </section>
      )}
    </div>
  );
}

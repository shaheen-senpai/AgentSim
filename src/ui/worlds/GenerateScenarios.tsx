"use client";
// "Generate Scenarios & seed data" (design/agentsim-console.html `renderWorldScenarios`, the
// `.draftbar` at the top of the list): stage two of building a World. The structure came from the
// agent's own repo; what it is tested with is written here, and read before it is saved.
//
// `POST /api/worlds/:id/scenarios` writes nothing — the proposal lives in this component until the
// reviewer saves it through the same PUT every other edit on this tab uses.
import { useEffect, useState } from "react";
import type { ValidationError } from "@/engine/pack";
import { useSavePack, ValidationNote } from "./useSavePack";

type Proposal = { files: Record<string, string>; errors: ValidationError[] };

/** The scenario files the proposal adds, and whether it rewrote the Seed. */
export function proposalChanges(current: Record<string, string>, proposed: Record<string, string>): { added: string[]; seedChanged: boolean } {
  const isScenario = (f: string) => f.startsWith("scenarios/") && f.endsWith(".yaml");
  const added = Object.keys(proposed)
    .filter((f) => isScenario(f) && proposed[f] !== current[f])
    .map((f) => f.slice("scenarios/".length, -".yaml".length))
    .sort();
  return { added, seedChanged: proposed["seed.yaml"] !== current["seed.yaml"] };
}

export function GenerateScenarios({ worldId, files }: { worldId: string; files: Record<string, string> }) {
  const { save, pending, errors } = useSavePack(worldId);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);

  // A generation is a long Opus call; the mock's button alone would look hung for minutes.
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function generate() {
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
    <>
      <div className="draftbar" style={{ background: "var(--surface)" }}>
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 12.5 }}>Generate Scenarios &amp; seed data</b>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            Claude writes the Task Brief, the Checks, the Attacks and the rows they need — from this World&rsquo;s own structure and Mandates. Nothing is saved until you have read it.
          </div>
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional — what should it test?"
          aria-label="What the Scenarios should test"
          style={{ flex: 1, minWidth: 190 }}
        />
        <button type="button" className="btn btn-primary" style={{ height: 32, fontSize: 12 }} disabled={busy || pending} onClick={generate}>
          {busy ? `Generating… ${elapsed}s` : "▷ Generate"}
        </button>
      </div>

      {failure && (
        <div className="nw-note" style={{ borderLeftColor: "var(--danger-fg)", color: "var(--danger-fg)" }} role="alert">
          {failure}
        </div>
      )}

      {proposal && changes && (
        <div className="panel card-pad" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>Proposed — {changes.added.length === 0 ? "no new Scenario" : `${changes.added.length} new Scenario${changes.added.length === 1 ? "" : "s"}`}</h2>
            <span className="tag-xs">nothing saved yet</span>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "0 0 12px" }}>
            {changes.seedChanged ? "The Seed was rewritten to carry the rows these Scenarios name. " : "The Seed is unchanged. "}
            Read the Checks against the Mandate they claim to grade: a Check that binds the wrong row passes for the wrong reason.
          </p>

          {proposal.errors.length > 0 && (
            <div className="nw-note" style={{ borderLeftColor: "var(--danger-fg)", color: "var(--danger-fg)" }}>
              <b>This proposal does not validate — {proposal.errors.length} problem{proposal.errors.length === 1 ? "" : "s"}.</b>
              {proposal.errors.slice(0, 8).map((e, i) => (
                <div key={i} className="mono" style={{ fontSize: 11, marginTop: 4 }}>{e.file}{e.path ? ` · ${e.path}` : ""}: {e.message}</div>
              ))}
            </div>
          )}

          {changes.added.map((id) => (
            <div key={id} style={{ marginBottom: 12 }}>
              <span className="field-label">scenarios/{id}.yaml</span>
              <pre className="mono" style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontSize: 11, lineHeight: 1.55, overflowX: "auto", margin: 0, whiteSpace: "pre" }}>
                {proposal.files[`scenarios/${id}.yaml`]}
              </pre>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ height: 32, fontSize: 12 }}
              disabled={pending || proposal.errors.length > 0}
              onClick={async () => {
                if (await save(proposal.files)) setProposal(null);
              }}
            >
              {pending ? "Saving…" : "Save to this World"}
            </button>
            <button type="button" className="btn btn-ghost" style={{ height: 32, fontSize: 12 }} disabled={pending} onClick={() => setProposal(null)}>Discard</button>
          </div>
          <ValidationNote errors={errors} />
        </div>
      )}
    </>
  );
}
